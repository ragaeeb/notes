import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { TRANSFORMERS } from '@lexical/markdown';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import type { SerializedEditorState } from 'lexical';
import { useEffect } from 'react';

import Toolbar from '../components/Toolbar';
import { EMPTY_EDITOR_STATE } from './emptyState';

const editorTheme = {
    code: 'block overflow-x-auto whitespace-pre-wrap break-words rounded bg-inset p-3 font-mono text-sm leading-6 text-fg',
    link: 'text-link underline underline-offset-2',
    list: { listitem: 'my-1', ol: 'list-decimal pl-6', ul: 'list-disc pl-6' },
    paragraph: 'mb-2 leading-7 text-fg',
    quote: 'border-l-2 border-edge-accent pl-4 italic text-fg-3',
    text: {
        bold: 'font-semibold',
        code: 'rounded bg-subtle px-1 py-0.5 font-mono text-sm leading-6',
        italic: 'italic',
        underline: 'underline',
    },
};

const EditableSyncPlugin = ({ readOnly }: { readOnly: boolean }) => {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        editor.setEditable(!readOnly);
    }, [editor, readOnly]);
    return null;
};

type EditorProps = {
    initialState: SerializedEditorState | null;
    onChange: (state: SerializedEditorState) => void;
    readOnly?: boolean;
    onClickToEdit?: () => void;
};

const Editor = ({ initialState, onChange, readOnly = false, onClickToEdit }: EditorProps) => {
    const initialConfig = {
        editable: !readOnly,
        editorState: JSON.stringify(initialState ?? EMPTY_EDITOR_STATE),
        namespace: 'notes-editor',
        nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, CodeHighlightNode],
        onError: (error: Error) => {
            throw error;
        },
        theme: editorTheme,
    };

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <EditableSyncPlugin readOnly={readOnly} />
            <div className="flex h-full flex-col rounded-xl border border-edge bg-glass">
                {!readOnly && <Toolbar />}
                <div className="relative flex-1">
                    {readOnly && onClickToEdit && (
                        <button
                            type="button"
                            onClick={onClickToEdit}
                            className="absolute inset-0 z-10 flex cursor-text items-start justify-center pt-3 opacity-0 transition-opacity hover:opacity-100"
                        >
                            <span className="rounded-full bg-pill px-3 py-1 text-fg-3 text-xs shadow">
                                Click to edit
                            </span>
                        </button>
                    )}
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                data-testid="editor-content"
                                aria-label="Document editor"
                                className="min-h-[calc(100vh-220px)] break-words px-6 py-5 text-fg outline-none"
                            />
                        }
                        placeholder={<div className="px-6 py-5 text-fg-faint">Start writing...</div>}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    {!readOnly && <AutoFocusPlugin />}
                    <ListPlugin />
                    <LinkPlugin />
                    <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                    <OnChangePlugin onChange={(editorState) => onChange(editorState.toJSON())} />
                </div>
            </div>
        </LexicalComposer>
    );
};

export default Editor;
