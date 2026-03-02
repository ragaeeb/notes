import type { SerializedEditorState } from 'lexical';
import { useEffect, useState } from 'react';

import Footer from './components/Footer';
import LimitIndicator from './components/LimitIndicator';
import ShareButton from './components/ShareButton';
import ThemeToggle from './components/ThemeToggle';
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
import { useTheme } from './hooks/useTheme';

const App = () => {
    const { isLoading, error: documentError, documentVersion, initialState } = useDocument();
    const { share, isCopied, urlLength, urlBudgetPercent, contentLength, error: shareError } = useShareUrl();
    const { theme, toggle: toggleTheme } = useTheme();

    const [editorState, setEditorState] = useState<SerializedEditorState>(EMPTY_EDITOR_STATE);
    const [isUrlLimitDialogDismissed, setIsUrlLimitDialogDismissed] = useState(false);

    const isSharedDocument = initialState !== null;
    const [isEditing, setIsEditing] = useState(!isSharedDocument);

    useEffect(() => {
        setIsEditing(!isSharedDocument);
    }, [isSharedDocument]);

    useEffect(() => {
        if (initialState) {
            setEditorState(initialState);
        }
    }, [initialState]);

    useEffect(() => {
        if (urlBudgetPercent < 95) {
            setIsUrlLimitDialogDismissed(false);
        }
    }, [urlBudgetPercent]);

    const effectiveInitialState = initialState ?? EMPTY_EDITOR_STATE;

    if (isLoading) {
        return <div className="app-shell p-6 text-fg-3 text-sm">Loading document...</div>;
    }

    return (
        <div className="app-shell flex min-h-screen flex-col bg-canvas text-fg">
            <div className="mx-auto flex w-full flex-1 flex-col px-4 py-4">
                <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-glass px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg tracking-tight">notes.</span>
                        <VersionBadge version={documentVersion ?? 'v1'} />
                    </div>
                    <div className="flex items-center gap-3">
                        <LimitIndicator percent={urlBudgetPercent} />
                        <ThemeToggle theme={theme} onToggle={toggleTheme} />
                        <ShareButton isCopied={isCopied} onShare={() => share(editorState)} />
                    </div>
                </header>

                {(documentError || shareError) && (
                    <div className="mb-3 rounded-lg border border-err-edge bg-err-bg px-3 py-2 text-err-fg text-sm">
                        {documentError ?? shareError}
                    </div>
                )}

                <main className="flex-1">
                    <Editor
                        initialState={effectiveInitialState}
                        onChange={setEditorState}
                        readOnly={!isEditing}
                        onClickToEdit={() => setIsEditing(true)}
                    />
                </main>

                <div className="mt-2 flex items-center justify-end gap-4 text-fg-dim text-xs">
                    {contentLength > 0 && <span>Content: {contentLength.toLocaleString()} chars</span>}
                    {urlLength > 0 && <span>Encoded: {urlLength.toLocaleString()} chars</span>}
                    {contentLength > 0 && urlLength > 0 && (
                        <span className="text-positive">
                            {Math.round((1 - urlLength / contentLength) * 100)}% smaller
                        </span>
                    )}
                </div>

                <Footer />
            </div>

            <Dialog
                open={urlBudgetPercent >= 95 && !isUrlLimitDialogDismissed}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsUrlLimitDialogDismissed(true);
                    }
                }}
            >
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
