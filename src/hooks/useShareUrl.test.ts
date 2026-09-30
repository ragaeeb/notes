import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';

const state = { root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 } };

const setClipboard = (writeText: (text: string) => Promise<void>) => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
};

afterEach(() => {
    mock.restore();
});

describe('useShareUrl', () => {
    it('should encode the current editor state and copy to clipboard', async () => {
        mock.module('../codecs', () => ({ encodeToUrl: async () => '/v1/#encoded' }));

        const writeText = mock(async () => undefined);
        setClipboard(writeText);

        const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
        const { result } = renderHook(() => useShareUrl());

        await act(async () => {
            await result.current.share(state);
        });

        expect(writeText).toHaveBeenCalled();
    });

    it('should set isCopied to true after successful share', async () => {
        mock.module('../codecs', () => ({ encodeToUrl: async () => '/v1/#encoded' }));

        setClipboard(async () => undefined);

        const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
        const { result } = renderHook(() => useShareUrl());

        await act(async () => {
            await result.current.share(state);
        });

        expect(result.current.isCopied).toBe(true);
    });

    it('should reset isCopied to false after 2 seconds', async () => {
        mock.module('../codecs', () => ({ encodeToUrl: async () => '/v1/#encoded' }));

        setClipboard(async () => undefined);

        const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
        const { result } = renderHook(() => useShareUrl());

        await act(async () => {
            await result.current.share(state);
        });

        await new Promise((resolve) => setTimeout(resolve, 2100));
        await waitFor(() => expect(result.current.isCopied).toBe(false));
    });

    it('should calculate urlBudgetPercent correctly', async () => {
        mock.module('../codecs', () => ({ encodeToUrl: async () => `/v1/#${'a'.repeat(1000)}` }));

        setClipboard(async () => undefined);

        const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
        const { result } = renderHook(() => useShareUrl());

        await act(async () => {
            await result.current.share(state);
        });

        expect(result.current.urlBudgetPercent).toBeCloseTo((1000 / 65536) * 100, 3);
    });

    it('should update the browser URL using replaceState not pushState', async () => {
        mock.module('../codecs', () => ({ encodeToUrl: async () => '/v1/#encoded' }));

        const originalReplaceState = window.history.replaceState;
        const originalPushState = window.history.pushState;
        const replaceSpy = mock(originalReplaceState.bind(window.history));
        const pushSpy = mock(originalPushState.bind(window.history));

        window.history.replaceState = replaceSpy as unknown as History['replaceState'];
        window.history.pushState = pushSpy as unknown as History['pushState'];

        try {
            setClipboard(async () => undefined);

            const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
            const { result } = renderHook(() => useShareUrl());

            await act(async () => {
                await result.current.share(state);
            });

            expect(replaceSpy).toHaveBeenCalled();
            expect(pushSpy).not.toHaveBeenCalled();
        } finally {
            window.history.replaceState = originalReplaceState;
            window.history.pushState = originalPushState;
        }
    });
});

describe('share request lifecycle', () => {
    it('should hold a snapshot, disable duplicate requests, and display the actual shared version', async () => {
        let finish: (value: string) => void = () => {};
        let captured: unknown;
        const encode = mock((snapshot: unknown) => {
            captured = snapshot;
            return new Promise<string>((resolve) => {
                finish = resolve;
            });
        });
        mock.module('../codecs', () => ({ encodeToUrl: encode }));
        const writeText = mock(async () => undefined);
        setClipboard(writeText);
        window.history.replaceState(null, '', '/v1/');
        const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
        const { result, unmount } = renderHook(() => useShareUrl());
        const mutable = JSON.parse(JSON.stringify(state));
        let pending: Promise<void> = Promise.resolve();
        await act(async () => {
            pending = result.current.share(mutable);
        });
        expect(result.current.isPreparing).toBe(true);
        mutable.root.format = 'right';
        await act(async () => {
            await result.current.share(mutable);
        });
        expect(encode).toHaveBeenCalledTimes(1);
        expect(captured).toEqual(state);
        await act(async () => {
            finish('/v2/#.done');
            await pending;
        });
        expect(result.current.isPreparing).toBe(false);
        expect(result.current.sharedVersion).toBe('v2');
        expect(writeText).toHaveBeenCalledTimes(1);
        unmount();
    });
    it('should not commit clipboard or history after unmount cancels a pending encode', async () => {
        let finish: (value: string) => void = () => {};
        let signal: AbortSignal | undefined;
        mock.module('../codecs', () => ({
            encodeToUrl: (_: unknown, input: AbortSignal) => {
                signal = input;
                return new Promise<string>((resolve) => {
                    finish = resolve;
                });
            },
        }));
        const writeText = mock(async () => undefined);
        setClipboard(writeText);
        window.history.replaceState(null, '', '/v1/');
        const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
        const { result, unmount } = renderHook(() => useShareUrl());
        let pending: Promise<void> = Promise.resolve();
        await act(async () => {
            pending = result.current.share(state);
        });
        unmount();
        expect(signal?.aborted).toBe(true);
        finish('/v2/#.stale');
        await pending;
        expect(writeText).not.toHaveBeenCalled();
        expect(window.location.hash).toBe('');
    });
    it('should leave the address unchanged on clipboard denial and allow retry', async () => {
        mock.module('../codecs', () => ({ encodeToUrl: async () => '/v2/#.retry' }));
        setClipboard(async () => {
            throw new Error('Clipboard denied');
        });
        window.history.replaceState(null, '', '/v1/');
        const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
        const { result, unmount } = renderHook(() => useShareUrl());
        await act(async () => {
            await result.current.share(state);
        });
        expect(result.current.error).toContain('Clipboard denied');
        expect(result.current.isPreparing).toBe(false);
        expect(window.location.hash).toBe('');
        setClipboard(async () => undefined);
        await act(async () => {
            await result.current.share(state);
        });
        expect(result.current.isCopied).toBe(true);
        expect(window.location.hash).toBe('#.retry');
        unmount();
    });
    it('should reset the badge and URL budget on navigation and cancel the previous share', async () => {
        let signal: AbortSignal | undefined;
        let finish: (value: string) => void = () => {};
        mock.module('../codecs', () => ({
            encodeToUrl: (_: unknown, input: AbortSignal) => {
                signal = input;
                return new Promise<string>((resolve) => {
                    finish = resolve;
                });
            },
        }));
        const writeText = mock(async () => undefined);
        setClipboard(writeText);
        const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
        const { result, unmount } = renderHook(() => useShareUrl());
        let pending: Promise<void> = Promise.resolve();
        await act(async () => {
            pending = result.current.share(state);
        });
        await act(async () => {
            window.history.replaceState(null, '', '/v1/#old');
            window.dispatchEvent(new Event('popstate'));
        });
        expect(signal?.aborted).toBe(true);
        await act(async () => {
            finish('/v2/#.stale');
            await pending;
        });
        expect(writeText).not.toHaveBeenCalled();
        expect(result.current.sharedVersion).toBeNull();
        expect(result.current.urlLength).toBe(3);
        unmount();
    });
});
