import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { TRANSFORMERS } from '@lexical/markdown';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
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

import Toolbar from '../components/Toolbar';
import { EMPTY_EDITOR_STATE } from './emptyState';

const editorTheme = {
    code: 'block overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-3 font-mono text-sm leading-6 text-slate-100',
    link: 'text-sky-300 underline underline-offset-2',
    list: { listitem: 'my-1', ol: 'list-decimal pl-6', ul: 'list-disc pl-6' },
    paragraph: 'mb-2 leading-7 text-slate-100',
    quote: 'border-l-2 border-slate-600 pl-4 italic text-slate-300',
    text: {
        bold: 'font-semibold',
        code: 'rounded bg-slate-800 px-1 py-0.5 font-mono text-sm leading-6',
        italic: 'italic',
        underline: 'underline',
    },
};

type EditorProps = { initialState: SerializedEditorState | null; onChange: (state: SerializedEditorState) => void };

const Editor = ({ initialState, onChange }: EditorProps) => {
    const initialConfig = {
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
            <div className="rounded-xl border border-slate-700 bg-slate-900/70">
                <Toolbar />
                <div className="min-h-[420px]">
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                data-testid="editor-content"
                                aria-label="Document editor"
                                className="min-h-[420px] break-words px-6 py-5 text-slate-100 outline-none"
                            />
                        }
                        placeholder={<div className="px-6 py-5 text-slate-500">Start writing...</div>}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <AutoFocusPlugin />
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
