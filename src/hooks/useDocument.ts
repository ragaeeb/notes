import type { SerializedEditorState } from 'lexical';
import { useEffect, useState } from 'react';
import { decodeFromUrl, detectVersion } from '../codecs';
import type { CodecVersion } from '../codecs/types';

type UseDocumentState = {
    documentKey: string;
    isLoading: boolean;
    error: string | null;
    documentVersion: CodecVersion | null;
    initialState: SerializedEditorState | null;
};
export const useDocument = (): UseDocumentState => {
    const [state, setState] = useState<UseDocumentState>({
        documentKey: 'initial',
        documentVersion: null,
        error: null,
        initialState: null,
        isLoading: true,
    });
    useEffect(() => {
        let controller: AbortController | null = null;
        const load = async (): Promise<void> => {
            controller?.abort();
            const request = new AbortController();
            controller = request;
            const documentKey = window.location.pathname + window.location.hash;
            const detected = detectVersion(window.location.pathname);
            const documentVersion = detected === 'unknown' ? null : detected;
            if (!window.location.hash.slice(1) || documentVersion === null) {
                setState({ documentKey, documentVersion, error: null, initialState: null, isLoading: false });
                return;
            }
            setState({ documentKey, documentVersion, error: null, initialState: null, isLoading: true });
            try {
                const initialState = await decodeFromUrl(request.signal);
                if (!request.signal.aborted) {
                    setState({ documentKey, documentVersion, error: null, initialState, isLoading: false });
                }
            } catch (error) {
                if (!request.signal.aborted) {
                    setState({
                        documentKey,
                        documentVersion,
                        error: error instanceof Error ? error.message : 'Unable to decode URL document',
                        initialState: null,
                        isLoading: false,
                    });
                }
            }
        };
        const onNavigation = (): void => {
            void load();
        };
        onNavigation();
        window.addEventListener('hashchange', onNavigation);
        window.addEventListener('popstate', onNavigation);
        return () => {
            controller?.abort();
            window.removeEventListener('hashchange', onNavigation);
            window.removeEventListener('popstate', onNavigation);
        };
    }, []);
    return state;
};
