import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';

afterEach(() => {
    mock.restore();
});

const mockCodecs = (
    decodeResult: unknown,
    opts?: { version?: 'v1' | 'v2' | 'unknown'; decodeReject?: boolean; pending?: boolean },
) => {
    mock.module('../codecs', () => ({
        decodeFromUrl: async () => {
            if (opts?.pending) {
                await new Promise(() => undefined);
            }

            if (opts?.decodeReject) {
                throw new Error('decode failed');
            }
            return decodeResult;
        },
        detectVersion: () => opts?.version ?? 'v1',
    }));
};

describe('useDocument', () => {
    it('should initialise with isLoading true on mount', async () => {
        mockCodecs(null, { pending: true });
        window.history.replaceState(null, '', '/v1/#abc');

        const { useDocument } = await import(`./useDocument?case=${Math.random()}`);
        const { result } = renderHook(() => useDocument());

        expect(result.current.isLoading).toBe(true);
    });

    it('should load editor state from URL hash when hash is present', async () => {
        const state = { root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 } };
        mockCodecs(state);
        window.history.replaceState(null, '', '/v1/#abc');

        const { useDocument } = await import(`./useDocument?case=${Math.random()}`);
        const { result } = renderHook(() => useDocument());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.initialState).toEqual(state);
    });

    it('should start with empty editor when hash is absent', async () => {
        mockCodecs(null);
        window.history.replaceState(null, '', '/v1/');

        const { useDocument } = await import(`./useDocument?case=${Math.random()}`);
        const { result } = renderHook(() => useDocument());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.initialState).toBeNull();
    });

    it('should expose documentVersion as "v1" for v1 paths', async () => {
        mockCodecs(null, { version: 'v1' });
        window.history.replaceState(null, '', '/v1/');

        const { useDocument } = await import(`./useDocument?case=${Math.random()}`);
        const { result } = renderHook(() => useDocument());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.documentVersion).toBe('v1');
    });

    it('should expose error when hash is malformed', async () => {
        mockCodecs(null, { decodeReject: true });
        window.history.replaceState(null, '', '/v1/#broken');

        const { useDocument } = await import(`./useDocument?case=${Math.random()}`);
        const { result } = renderHook(() => useDocument());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.error).toContain('decode failed');
    });

    it('should expose documentVersion as null when no document is loaded', async () => {
        mockCodecs(null, { version: 'unknown' });
        window.history.replaceState(null, '', '/');

        const { useDocument } = await import(`./useDocument?case=${Math.random()}`);
        const { result } = renderHook(() => useDocument());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.documentVersion).toBeNull();
    });
});

describe('v2 document lifecycle', () => {
    it('should load the explicit empty v2 link rather than treating it as no hash', async () => {
        const state = { root: { children: [], type: 'root' } };
        mockCodecs(state, { version: 'v2' });
        window.history.replaceState(null, '', '/v2/#.');
        const { useDocument } = await import(`./useDocument?case=${Math.random()}`);
        const { result, unmount } = renderHook(() => useDocument());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.initialState).toEqual(state);
        expect(result.current.documentVersion).toBe('v2');
        unmount();
    });
    it('should cancel stale loads on navigation and ignore a late decoder result', async () => {
        const signals: AbortSignal[] = [];
        const finish: ((value: unknown) => void)[] = [];
        mock.module('../codecs', () => ({
            decodeFromUrl: (signal: AbortSignal) => {
                signals.push(signal);
                return new Promise((resolve) => finish.push(resolve));
            },
            detectVersion: () => 'v2',
        }));
        // happy-dom emits hashchange on a 0ms timeout after replaceState. Flush that
        // timer instead of dispatching a second event, which aborts the real load.
        const flushNavigation = async (): Promise<void> => {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
        };
        window.history.replaceState(null, '', '/v2/#.first');
        const { useDocument } = await import(`./useDocument?case=${Math.random()}`);
        const { result, unmount } = renderHook(() => useDocument());
        await flushNavigation();
        expect(signals.length).toBeGreaterThan(0);
        await act(async () => {
            window.history.replaceState(null, '', '/v2/#.second');
        });
        await flushNavigation();
        const currentIndex = signals.length - 1;
        expect(currentIndex).toBeGreaterThan(0);
        expect(signals[0]?.aborted).toBe(true);
        expect(signals[currentIndex]?.aborted).toBe(false);
        const state = { root: { children: [], type: 'root' } };
        await act(async () => {
            finish[currentIndex]?.(state);
            for (let i = 0; i < currentIndex; i++) {
                finish[i]?.({ root: { stale: true } });
            }
        });
        expect(result.current.initialState).toEqual(state);
        expect(result.current.documentKey).toBe('/v2/#.second');
        unmount();
        expect(signals[currentIndex]?.aborted).toBe(true);
    });
});
