import { CodecError } from '../../src/codecs/types';
import { type CodecJob, runCodecJob, type WorkerPort } from '../../src/codecs/worker-client';
import type { CaseResult } from './wire-contract';

const input: CodecJob = {
    operation: 'encode',
    state: { root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 } } as never,
    version: 'v2',
};
class FakePort extends EventTarget {
    terminated = 0;
    listeners = 0;
    start: (port: FakePort) => void = () => {};
    postMessage(): void {
        queueMicrotask(() => this.start(this));
    }
    terminate(): void {
        this.terminated++;
    }
    override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
        this.listeners++;
        super.addEventListener(type, callback);
    }
    override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
        this.listeners--;
        super.removeEventListener(type, callback);
    }
    reply(data: unknown): void {
        this.dispatchEvent(new MessageEvent('message', { data }));
    }
}
const assert = (condition: unknown, message: string): void => {
    if (!condition) {
        throw Error(message);
    }
};
export const runWorkerContract = async (): Promise<CaseResult[]> => {
    const cases: CaseResult[] = [];
    const run = async (
        name: string,
        script: (port: FakePort, abort: AbortController) => void,
        expected: string | null,
        job = input,
    ): Promise<void> => {
        const port = new FakePort();
        const controller = new AbortController();
        port.start = (p) => script(p, controller);
        const start = performance.now();
        try {
            let value: unknown;
            let error: unknown;
            try {
                value = await runCodecJob(job, {
                    createWorker: () => port as unknown as WorkerPort,
                    deadlineMs: 20,
                    signal: controller.signal,
                });
            } catch (failure) {
                error = failure;
            }
            if (expected === null) {
                assert(error instanceof CodecError, 'Missing CodecError.');
            } else {
                assert(value === expected && error === undefined, 'Incorrect worker result.');
            }
            assert(port.terminated === 1 && port.listeners === 0, 'Worker cleanup failed.');
            port.reply({ type: 'result', value: '.stale' });
            assert(port.terminated === 1, 'Late message settled twice.');
            cases.push({ elapsedMs: performance.now() - start, name, status: 'pass' });
        } catch (error) {
            cases.push({ detail: String(error), elapsedMs: performance.now() - start, name, status: 'fail' });
        }
    };
    await run('worker/completion cleanup', (port) => port.reply({ type: 'result', value: '.done' }), '.done');
    await run(
        'worker/timeout best valid progress',
        (port) => {
            port.reply({ fragment: '.long', type: 'progress' });
            port.reply({ fragment: '.x', type: 'progress' });
        },
        '.x',
    );
    await run('worker/timeout without baseline', () => {}, null);
    await run('worker/decode timeout', () => {}, null, { fragment: '.test', operation: 'decode', version: 'v2' });
    await run(
        'worker/cancel discards completed progress',
        (port, abort) => {
            port.reply({ fragment: '.x', type: 'progress' });
            abort.abort();
        },
        null,
    );
    await run(
        'worker/error retains validated progress',
        (port) => {
            port.reply({ fragment: '.x', type: 'progress' });
            port.dispatchEvent(new Event('error'));
        },
        '.x',
    );
    await run('worker/error without baseline', (port) => port.dispatchEvent(new Event('messageerror')), null);
    await run('worker/invalid reply', (port) => port.reply(null), null);
    await run('worker/explicit error', (port) => port.reply({ message: 'Invalid link', type: 'error' }), null);
    await run(
        'worker/stable progress tie',
        (port) => {
            port.reply({ fragment: '.b', type: 'progress' });
            port.reply({ fragment: '.a', type: 'progress' });
        },
        '.a',
    );
    const controller = new AbortController();
    controller.abort();
    let created = false;
    try {
        await runCodecJob(input, {
            createWorker: () => {
                created = true;
                return new FakePort() as unknown as WorkerPort;
            },
            signal: controller.signal,
        });
        cases.push({ elapsedMs: 0, name: 'worker/pre-aborted signal', status: 'fail' });
    } catch (error) {
        cases.push({
            elapsedMs: 0,
            name: 'worker/pre-aborted signal',
            status: error instanceof CodecError && !created ? 'pass' : 'fail',
        });
    }
    return cases;
};
