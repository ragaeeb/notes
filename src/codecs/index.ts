import type { SerializedEditorState } from 'lexical';
import { ENABLE_CM, WRITER_VERSION } from './config';
import type { DetectVersionResult } from './types';
import { runCodecJob } from './worker-client';

export const detectVersion = (pathname: string): DetectVersionResult => {
    if (pathname === '/v1' || pathname.startsWith('/v1/')) {
        return 'v1';
    }
    if (pathname === '/v2' || pathname.startsWith('/v2/')) {
        return 'v2';
    }
    return 'unknown';
};
export const decodeFromUrl = async (signal?: AbortSignal): Promise<SerializedEditorState | null> => {
    const fragment = window.location.hash.slice(1);
    const version = detectVersion(window.location.pathname);
    if (!fragment || version === 'unknown') {
        return null;
    }
    return (await runCodecJob({ fragment, operation: 'decode', version }, { signal })) as SerializedEditorState;
};
export const encodeToUrl = async (state: SerializedEditorState, signal?: AbortSignal): Promise<string> => {
    const encoded = await runCodecJob(
        { includeCm: ENABLE_CM, operation: 'encode', state, version: WRITER_VERSION },
        { signal },
    );
    return `/${WRITER_VERSION}/#${encoded}`;
};
