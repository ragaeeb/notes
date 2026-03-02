import type { SerializedEditorState } from 'lexical';
import { useEffect, useMemo, useState } from 'react';

import Footer from './components/Footer';
import LimitIndicator from './components/LimitIndicator';
import ShareButton from './components/ShareButton';
import { Button } from './components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from './components/ui/dialog';
import VersionBadge from './components/VersionBadge';
import Editor from './editor/Editor';
import { EMPTY_EDITOR_STATE } from './editor/emptyState';
import { useDocument } from './hooks/useDocument';
import { useShareUrl } from './hooks/useShareUrl';

const App = () => {
    const { isLoading, error: documentError, documentVersion, initialState } = useDocument();
    const { share, isCopied, urlLength, urlBudgetPercent, error: shareError } = useShareUrl();

    const [editorState, setEditorState] = useState<SerializedEditorState>(EMPTY_EDITOR_STATE);

    useEffect(() => {
        if (initialState) {
            setEditorState(initialState);
        }
    }, [initialState]);

    const effectiveInitialState = useMemo(() => {
        return initialState ?? EMPTY_EDITOR_STATE;
    }, [initialState]);

    if (isLoading) {
        return <div className="app-shell p-6 text-slate-300 text-sm">Loading document...</div>;
    }

    return (
        <div className="app-shell min-h-screen bg-slate-950 text-slate-100">
            <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6">
                <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg tracking-tight">notes.</span>
                        <VersionBadge version={documentVersion ?? 'v1'} />
                    </div>
                    <div className="flex items-center gap-3">
                        <LimitIndicator percent={urlBudgetPercent} />
                        <ShareButton isCopied={isCopied} onShare={() => share(editorState)} />
                    </div>
                </header>

                {(documentError || shareError) && (
                    <div className="mb-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-red-200 text-sm">
                        {documentError ?? shareError}
                    </div>
                )}

                <main className="flex-1">
                    <Editor initialState={effectiveInitialState} onChange={setEditorState} />
                </main>

                <div className="mt-3 text-right text-slate-400 text-xs">Encoded hash length: {urlLength}</div>

                <Footer />
            </div>

            <Dialog open={urlBudgetPercent >= 95}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>URL Near Limit</DialogTitle>
                        <DialogDescription>
                            This document is above 95% of the conservative cross-browser URL budget and may fail to
                            share.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Close</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default App;
