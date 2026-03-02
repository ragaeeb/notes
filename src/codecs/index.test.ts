import { describe, expect, it, mock } from 'bun:test';

import { detectVersion } from './index';

describe('detectVersion', () => {
    it('should return "v1" for /v1/ paths', () => {
        expect(detectVersion('/v1/')).toBe('v1');
        expect(detectVersion('/v1/path')).toBe('v1');
    });

    it('should return "unknown" for unrecognised paths', () => {
        expect(detectVersion('/v2/')).toBe('unknown');
    });

    it('should return "unknown" for root path', () => {
        expect(detectVersion('/')).toBe('unknown');
    });
});

describe('decodeFromUrl', () => {
    it('should dispatch to v1 decoder for /v1/#... URLs', async () => {
        mock.module('./v1', () => ({
            decode: async () => ({
                root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 },
            }),
            encode: async () => 'abc',
        }));

        const { decodeFromUrl } = await import(`./index?case=${Math.random()}`);
        window.history.replaceState(null, '', '/v1/#abc');

        const decoded = await decodeFromUrl();
        expect(decoded).not.toBeNull();
    });

    it('should return null when hash is empty', async () => {
        const { decodeFromUrl } = await import(`./index?case=${Math.random()}`);
        window.history.replaceState(null, '', '/v1/');

        expect(await decodeFromUrl()).toBeNull();
    });

    it('should return null when version is unknown', async () => {
        const { decodeFromUrl } = await import(`./index?case=${Math.random()}`);
        window.history.replaceState(null, '', '/v2/#abc');

        expect(await decodeFromUrl()).toBeNull();
    });
});
