import type { SerializedEditorState } from 'lexical';
import { useEffect, useState } from 'react';

import { decodeFromUrl, detectVersion } from '../codecs';

type UseDocumentState = {
    isLoading: boolean;
    error: string | null;
    documentVersion: 'v1' | null;
    initialState: SerializedEditorState | null;
};

export const useDocument = (): UseDocumentState => {
    const [state, setState] = useState<UseDocumentState>({
        documentVersion: null,
        error: null,
        initialState: null,
        isLoading: true,
    });

    useEffect(() => {
        let cancelled = false;

        const loadDocument = async () => {
            const version = detectVersion(window.location.pathname);
            const documentVersion = version === 'v1' ? 'v1' : null;
            const hash = window.location.hash.slice(1);

            if (!hash || version !== 'v1') {
                if (!cancelled) {
                    setState({ documentVersion, error: null, initialState: null, isLoading: false });
                }
                return;
            }

            try {
                const decoded = await decodeFromUrl();
                if (!cancelled) {
                    setState({ documentVersion, error: null, initialState: decoded, isLoading: false });
                }
            } catch (error) {
                if (!cancelled) {
                    setState({
                        documentVersion,
                        error: error instanceof Error ? error.message : 'Unable to decode URL document',
                        initialState: null,
                        isLoading: false,
                    });
                }
            }
        };

        void loadDocument();

        return () => {
            cancelled = true;
        };
    }, []);

    return state;
};
