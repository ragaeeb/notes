import type { SerializedEditorState } from 'lexical';
import { CodecError, type CodecVersion } from './types';
import { MAX_FRAGMENT_CHARS, WORKER_DEADLINE_MS } from './v2-constants';

export type CodecJob =
    | { operation: 'encode'; version: CodecVersion; state: SerializedEditorState; includeCm?: boolean }
    | { operation: 'decode'; version: CodecVersion; fragment: string };
export type WorkerReply =
    | { type: 'progress'; fragment: string }
    | { type: 'result'; value: string | SerializedEditorState }
    | { type: 'error'; message: string };
export type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'>;
export type JobOptions = { signal?: AbortSignal; deadlineMs?: number; createWorker?: () => WorkerPort };
export const runCodecJob = (job: CodecJob, options: JobOptions = {}): Promise<string | SerializedEditorState> => {
    return new Promise((resolve, reject) => {
        let worker: WorkerPort | null = null;
        let best: string | null = null;
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cleanup = (): void => {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', abort);
            worker?.removeEventListener('message', message);
            worker?.removeEventListener('error', error);
            worker?.removeEventListener('messageerror', error);
            worker?.terminate();
        };
        const finish = (value?: string | SerializedEditorState, failure?: CodecError): void => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            if (failure) {
                reject(failure);
            } else if (value !== undefined) {
                resolve(value);
            } else {
                reject(new CodecError('The compression worker returned no result.'));
            }
        };
        const abort = (): void => finish(undefined, new CodecError('Share preparation was cancelled.'));
        const failure = (message: string): void => {
            if (job.operation === 'encode' && best !== null) {
                finish(best);
            } else {
                finish(undefined, new CodecError(message));
            }
        };
        const error: EventListener = () => failure('The compression worker failed. Please try again.');
        const message: EventListener = (event) => {
            if (settled || options.signal?.aborted) {
                return;
            }
            const reply = (event as MessageEvent<WorkerReply>).data;
            if (!reply || typeof reply !== 'object') {
                return failure('Invalid compression worker response.');
            }
            if (reply.type === 'progress') {
                if (
                    job.operation !== 'encode' ||
                    typeof reply.fragment !== 'string' ||
                    !reply.fragment ||
                    reply.fragment.length > MAX_FRAGMENT_CHARS
                ) {
                    return failure('Invalid compression progress.');
                }
                if (
                    best === null ||
                    reply.fragment.length < best.length ||
                    (reply.fragment.length === best.length && reply.fragment < best)
                ) {
                    best = reply.fragment;
                }
            } else if (reply.type === 'result') {
                if (
                    job.operation === 'encode'
                        ? typeof reply.value !== 'string' || !reply.value
                        : typeof reply.value !== 'object' || reply.value === null
                ) {
                    return failure('Invalid compression worker result.');
                }
                finish(reply.value);
            } else if (reply.type === 'error') {
                failure(reply.message);
            } else {
                failure('Unknown compression worker response.');
            }
        };
        if (options.signal?.aborted) {
            return abort();
        }
        options.signal?.addEventListener('abort', abort, { once: true });
        try {
            timer = setTimeout(
                () =>
                    failure(
                        job.operation === 'encode'
                            ? 'Share preparation exceeded the time limit. Please try a smaller document.'
                            : 'Loading this document exceeded the time limit.',
                    ),
                options.deadlineMs ?? WORKER_DEADLINE_MS,
            );
            worker = options.createWorker
                ? options.createWorker()
                : new Worker(new URL('./v2.worker.ts', import.meta.url), { type: 'module' });
            worker.addEventListener('message', message);
            worker.addEventListener('error', error);
            worker.addEventListener('messageerror', error);
            worker.postMessage(job);
        } catch {
            failure('A dedicated compression worker could not be started in this browser.');
        }
    });
};
