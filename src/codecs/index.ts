import type { SerializedEditorState } from 'lexical';
import type { DetectVersionResult } from './types';
import { decode as decodeV1, encode as encodeV1 } from './v1';

export const detectVersion = (pathname: string): DetectVersionResult => {
    if (pathname === '/v1' || pathname.startsWith('/v1/')) {
        return 'v1';
    }

    return 'unknown';
};

export const decodeFromUrl = async (): Promise<SerializedEditorState | null> => {
    const hash = window.location.hash.slice(1);
    if (!hash) {
        return null;
    }

    const version = detectVersion(window.location.pathname);
    if (version !== 'v1') {
        return null;
    }

    return decodeV1(hash);
};

export const encodeToUrl = async (state: SerializedEditorState): Promise<string> => {
    const encoded = await encodeV1(state);
    return `/v1/#${encoded}`;
};
