import { describe, expect, it, mock } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';

const mockCodecs = (
    decodeResult: unknown,
    opts?: { version?: 'v1' | 'unknown'; decodeReject?: boolean; pending?: boolean },
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
