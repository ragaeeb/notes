import { CodecError } from '../../src/codecs/types';
import { runCodecJob, type CodecJob, type WorkerPort } from '../../src/codecs/worker-client';
import type { CaseResult } from './wire-contract';
const input: CodecJob = { operation: 'encode', version: 'v2', state: { root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 } } as never };
class FakePort extends EventTarget {
    terminated = 0;
    listeners = 0;
    start: (port: FakePort) => void = () => {};
    postMessage(): void { queueMicrotask(() => this.start(this)); }
    terminate(): void { this.terminated++; }
    override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void { this.listeners++; super.addEventListener(type, callback); }
    override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void { this.listeners--; super.removeEventListener(type, callback); }
    reply(data: unknown): void { this.dispatchEvent(new MessageEvent('message', { data })); }
}
const assert = (condition: unknown, message: string): void => { if (!condition) throw Error(message); };
export const runWorkerContract = async (): Promise<CaseResult[]> => {
    const cases: CaseResult[] = [];
    const run = async (name: string, script: (port: FakePort, abort: AbortController) => void, expected: string | null, job = input): Promise<void> => {
        const port = new FakePort();
        const controller = new AbortController();
        port.start = p => script(p, controller);
        const start = performance.now();
        try {
            let value: unknown;
            let error: unknown;
            try { value = await runCodecJob(job, { createWorker: () => port as unknown as WorkerPort, signal: controller.signal, deadlineMs: 20 }); }
            catch (failure) { error = failure; }
            if (expected === null) assert(error instanceof CodecError, 'Missing CodecError.');
            else assert(value === expected && error === undefined, 'Incorrect worker result.');
            assert(port.terminated === 1 && port.listeners === 0, 'Worker cleanup failed.');
            port.reply({ type: 'result', value: '.stale' });
            assert(port.terminated === 1, 'Late message settled twice.');
            cases.push({ name, status: 'pass', elapsedMs: performance.now() - start });
        } catch (error) { cases.push({ name, status: 'fail', elapsedMs: performance.now() - start, detail: String(error) }); }
    };
    await run('worker/completion cleanup', port => port.reply({ type: 'result', value: '.done' }), '.done');
    await run('worker/timeout best valid progress', port => { port.reply({ type: 'progress', fragment: '.long' }); port.reply({ type: 'progress', fragment: '.x' }); }, '.x');
    await run('worker/timeout without baseline', () => {}, null);
    await run('worker/decode timeout', () => {}, null, { operation: 'decode', version: 'v2', fragment: '.test' });
    await run('worker/cancel discards completed progress', (port, abort) => { port.reply({ type: 'progress', fragment: '.x' }); abort.abort(); }, null);
    await run('worker/error retains validated progress', port => { port.reply({ type: 'progress', fragment: '.x' }); port.dispatchEvent(new Event('error')); }, '.x');
    await run('worker/error without baseline', port => port.dispatchEvent(new Event('messageerror')), null);
    await run('worker/invalid reply', port => port.reply(null), null);
    await run('worker/explicit error', port => port.reply({ type: 'error', message: 'Invalid link' }), null);
    await run('worker/stable progress tie', port => { port.reply({ type: 'progress', fragment: '.b' }); port.reply({ type: 'progress', fragment: '.a' }); }, '.a');
    const controller = new AbortController(); controller.abort();
    let created = false;
    try {
        await runCodecJob(input, { signal: controller.signal, createWorker: () => { created = true; return new FakePort() as unknown as WorkerPort; } });
        cases.push({ name: 'worker/pre-aborted signal', status: 'fail', elapsedMs: 0 });
    } catch (error) { cases.push({ name: 'worker/pre-aborted signal', status: error instanceof CodecError && !created ? 'pass' : 'fail', elapsedMs: 0 }); }
    return cases;
};
