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

        const replaceSpy = mock(window.history.replaceState.bind(window.history));
        const pushSpy = mock(window.history.pushState.bind(window.history));

        window.history.replaceState = replaceSpy as unknown as History['replaceState'];
        window.history.pushState = pushSpy as unknown as History['pushState'];

        setClipboard(async () => undefined);

        const { useShareUrl } = await import(`./useShareUrl?case=${Math.random()}`);
        const { result } = renderHook(() => useShareUrl());

        await act(async () => {
            await result.current.share(state);
        });

        expect(replaceSpy).toHaveBeenCalled();
        expect(pushSpy).not.toHaveBeenCalled();
    });
});
