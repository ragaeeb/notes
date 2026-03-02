import type { SerializedEditorState } from 'lexical';
import { useEffect, useRef, useState } from 'react';

import { encodeToUrl } from '../codecs';

const URL_BUDGET_LIMIT = 65536;
const COPY_RESET_MS = 2000;

export type UseShareUrlResult = {
    share: (state: SerializedEditorState) => Promise<void>;
    isCopied: boolean;
    urlLength: number;
    urlBudgetPercent: number;
    contentLength: number;
    error: string | null;
};

const toBudgetPercent = (encodedLength: number): number => {
    return (encodedLength / URL_BUDGET_LIMIT) * 100;
};

export const useShareUrl = (): UseShareUrlResult => {
    const [isCopied, setIsCopied] = useState(false);
    const [urlLength, setUrlLength] = useState(0);
    const [urlBudgetPercent, setUrlBudgetPercent] = useState(0);
    const [contentLength, setContentLength] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<number | null>(null);

    const resetCopiedState = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }

        timerRef.current = window.setTimeout(() => {
            setIsCopied(false);
            timerRef.current = null;
        }, COPY_RESET_MS);
    };

    const share = async (state: SerializedEditorState) => {
        setError(null);

        try {
            const rawJson = JSON.stringify(state);
            setContentLength(rawJson.length);

            const relativeUrl = await encodeToUrl(state);
            const hash = relativeUrl.split('#')[1] ?? '';
            const absoluteUrl = `${window.location.origin}${relativeUrl}`;

            window.history.replaceState(null, '', relativeUrl);

            setUrlLength(hash.length);
            setUrlBudgetPercent(toBudgetPercent(hash.length));

            await navigator.clipboard.writeText(absoluteUrl);
            setIsCopied(true);
            resetCopiedState();
        } catch (shareError) {
            setIsCopied(false);
            setError(shareError instanceof Error ? shareError.message : 'Unable to generate share URL');
        }
    };

    useEffect(() => {
        const initialHashLength = window.location.hash.slice(1).length;
        setUrlLength(initialHashLength);
        setUrlBudgetPercent(toBudgetPercent(initialHashLength));

        return () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
            }
        };
    }, []);

    return { contentLength, error, isCopied, share, urlBudgetPercent, urlLength };
};
