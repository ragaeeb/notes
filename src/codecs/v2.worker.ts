import type { SerializedEditorState } from 'lexical';
import { CodecError } from './types';
import { decode as decodeV1, encode as encodeV1 } from './v1';
import { decode as decodeV2, encode as encodeV2 } from './v2';
import { canonicalState, type Json, sameJson } from './v2-json';
import type { CodecJob, WorkerReply } from './worker-client';

type Scope = {
    onmessage: ((event: MessageEvent<CodecJob>) => void) | null;
    postMessage: (reply: WorkerReply) => void;
    close: () => void;
};
const scope = globalThis as unknown as Scope;
scope.onmessage = (event) => {
    scope.onmessage = null; // Exactly one job per dedicated worker.
    const run = async (): Promise<void> => {
        try {
            const job = event.data;
            let value: string | SerializedEditorState;
            if (job.operation === 'encode') {
                if (job.version === 'v2') {
                    value = await encodeV2(job.state, {
                        includeCm: job.includeCm,
                        onProgress: (fragment) => scope.postMessage({ fragment, type: 'progress' }),
                    });
                } else if (job.version === 'v1') {
                    const input = canonicalState(job.state);
                    value = await encodeV1(input as unknown as SerializedEditorState);
                    const restored = await decodeV1(value);
                    if (!sameJson(restored as unknown as Json, input)) {
                        throw new CodecError('This document needs the lossless v2 writer; v1 would change its fields.');
                    }
                    scope.postMessage({ fragment: value, type: 'progress' });
                } else {
                    throw new CodecError('Unsupported codec version.');
                }
            } else if (job.operation === 'decode') {
                if (job.version === 'v2') {
                    value = await decodeV2(job.fragment);
                } else if (job.version === 'v1') {
                    value = await decodeV1(job.fragment);
                } else {
                    throw new CodecError('Unsupported codec version.');
                }
                canonicalState(value); // Also validate the legacy reader's final document limits.
            } else {
                throw new CodecError('Unsupported compression operation.');
            }
            scope.postMessage({ type: 'result', value });
        } catch (error) {
            scope.postMessage({
                message: error instanceof Error ? error.message : 'Unable to process the document.',
                type: 'error',
            });
        } finally {
            scope.close();
        }
    };
    void run();
};
