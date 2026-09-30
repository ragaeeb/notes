import type { SerializedEditorState } from 'lexical';
import { useEffect, useRef, useState } from 'react';
import { encodeToUrl } from '../codecs';
import type { CodecVersion } from '../codecs/types';

const URL_BUDGET_LIMIT = 65536;
const COPY_RESET_MS = 2000;
export type UseShareUrlResult = {
    share: (state: SerializedEditorState) => Promise<void>;
    isCopied: boolean;
    isPreparing: boolean;
    sharedVersion: CodecVersion | null;
    urlLength: number;
    urlBudgetPercent: number;
    contentLength: number;
    error: string | null;
};
export const useShareUrl = (): UseShareUrlResult => {
    const [isCopied, setIsCopied] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);
    const [sharedVersion, setSharedVersion] = useState<CodecVersion | null>(null);
    const [urlLength, setUrlLength] = useState(0);
    const [contentLength, setContentLength] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<number | null>(null);
    const requestRef = useRef<AbortController | null>(null);
    const mounted = useRef(true);
    // happy-dom emits hashchange after replaceState. Browsers do not. Ignore that
    // one self-triggered event so a successful share keeps its version badge.
    const ownHistoryUrl = useRef<string | null>(null);
    const share = async (state: SerializedEditorState): Promise<void> => {
        if (requestRef.current || !mounted.current) {
            return; // Duplicate click: retain the requested snapshot.
        }
        const controller = new AbortController();
        requestRef.current = controller;
        const current = (): boolean =>
            mounted.current && requestRef.current === controller && !controller.signal.aborted;
        setError(null);
        setIsCopied(false);
        setIsPreparing(true);
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }
        try {
            const json = JSON.stringify(state);
            const snapshot = JSON.parse(json) as SerializedEditorState;
            const relativeUrl = await encodeToUrl(snapshot, controller.signal);
            if (!current()) {
                return;
            }
            const url = new URL(relativeUrl, window.location.origin);
            if (url.origin !== window.location.origin || !/^\/v[12]\/$/.test(url.pathname) || !url.hash) {
                throw new Error('Invalid share URL.');
            }
            // No clipboard or history effects before a current, successfully encoded result.
            // A clipboard permission failure leaves the address unchanged and is retryable.
            await navigator.clipboard.writeText(url.href);
            if (!current()) {
                return;
            }
            const historyUrl = `${url.pathname}${url.hash}`;
            ownHistoryUrl.current = historyUrl;
            window.history.replaceState(null, '', historyUrl);
            setContentLength(json.length);
            setUrlLength(url.hash.slice(1).length);
            setSharedVersion(url.pathname === '/v2/' ? 'v2' : 'v1');
            setIsCopied(true);
            timerRef.current = window.setTimeout(() => {
                setIsCopied(false);
                timerRef.current = null;
            }, COPY_RESET_MS);
        } catch (failure) {
            if (current()) {
                setIsCopied(false);
                setError(failure instanceof Error ? failure.message : 'Unable to generate share URL.');
            }
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                if (mounted.current) {
                    setIsPreparing(false);
                }
            }
        }
    };
    useEffect(() => {
        mounted.current = true;
        setUrlLength(window.location.hash.slice(1).length);
        const onNavigation = (): void => {
            const currentUrl = window.location.pathname + window.location.hash;
            // Several hashchange timeouts can flush for one replaceState. Ignore all of
            // them while the address is still the URL this share wrote.
            if (ownHistoryUrl.current !== null && ownHistoryUrl.current === currentUrl) {
                return;
            }
            ownHistoryUrl.current = null;
            requestRef.current?.abort();
            requestRef.current = null;
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
            }
            timerRef.current = null;
            setIsPreparing(false);
            setIsCopied(false);
            setSharedVersion(null);
            setContentLength(0);
            setError(null);
            setUrlLength(window.location.hash.slice(1).length);
        };
        window.addEventListener('hashchange', onNavigation);
        window.addEventListener('popstate', onNavigation);
        return () => {
            window.removeEventListener('hashchange', onNavigation);
            window.removeEventListener('popstate', onNavigation);
            mounted.current = false;
            requestRef.current?.abort();
            requestRef.current = null;
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
            }
        };
    }, []);
    return {
        contentLength,
        error,
        isCopied,
        isPreparing,
        share,
        sharedVersion,
        urlBudgetPercent: (urlLength / URL_BUDGET_LIMIT) * 100,
        urlLength,
    };
};
