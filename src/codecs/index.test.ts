import { afterEach, describe, expect, it, mock } from 'bun:test';
import { detectVersion } from './index';

afterEach(() => {
    mock.restore();
});
describe('detectVersion', () => {
    it('should recognize v1 and v2 paths without prefix collisions', () => {
        for (const version of ['v1', 'v2']) {
            expect(detectVersion(`/${version}`)).toBe(version);
            expect(detectVersion(`/${version}/`)).toBe(version);
            expect(detectVersion(`/${version}/path`)).toBe(version);
        }
        for (const path of ['/', '/v3/', '/v20/', '/v1-other']) {
            expect(detectVersion(path)).toBe('unknown');
        }
    });
});
describe('URL codec worker dispatch', () => {
    it('should dispatch both readers and forward cancellation', async () => {
        const state = { root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 } };
        const job = mock(async () => state);
        mock.module('./worker-client', () => ({ runCodecJob: job }));
        const { decodeFromUrl } = await import(`./index?case=${Math.random()}`);
        const controller = new AbortController();
        for (const version of ['v1', 'v2']) {
            window.history.replaceState(null, '', `/${version}/#.`);
            expect(await decodeFromUrl(controller.signal)).toEqual(state);
            expect(job).toHaveBeenLastCalledWith(
                { fragment: '.', operation: 'decode', version },
                { signal: controller.signal },
            );
        }
    });
    it('should not create a worker for empty hashes or unknown paths', async () => {
        const job = mock(async () => null);
        mock.module('./worker-client', () => ({ runCodecJob: job }));
        const { decodeFromUrl } = await import(`./index?case=${Math.random()}`);
        for (const path of ['/v1/', '/v2/', '/v3/#abc']) {
            window.history.replaceState(null, '', path);
            expect(await decodeFromUrl()).toBeNull();
        }
        expect(job).not.toHaveBeenCalled();
    });
    it('should use the configured writer and never label a worker result with a different version', async () => {
        const { WRITER_VERSION, ENABLE_CM } = await import('./config');
        const job = mock(async (_job: unknown, _options?: unknown) => '.hello');
        mock.module('./worker-client', () => ({ runCodecJob: job }));
        const { encodeToUrl } = await import(`./index?case=${Math.random()}`);
        const state = { root: { children: [] } } as never;
        expect(await encodeToUrl(state)).toBe(`/${WRITER_VERSION}/#.hello`);
        expect(job.mock.calls[0][0]).toMatchObject({
            includeCm: ENABLE_CM,
            operation: 'encode',
            version: WRITER_VERSION,
        });
    });
});
