import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { FORMAT_TEXT_COMMAND, type LexicalCommand, REDO_COMMAND, type TextFormatType, UNDO_COMMAND } from 'lexical';

import { Button } from './ui/button';

const Toolbar = () => {
    const [editor] = useLexicalComposerContext();

    const dispatch = <T,>(command: LexicalCommand<T>, payload: T) => {
        editor.dispatchCommand(command, payload);
    };

    const formatText = (format: TextFormatType) => {
        dispatch(FORMAT_TEXT_COMMAND, format);
    };

    return (
        <div className="flex flex-wrap items-center gap-2 border-edge border-b bg-overlay px-4 py-3">
            <Button
                size="sm"
                variant="outline"
                onClick={() => dispatch(UNDO_COMMAND, undefined)}
                type="button"
                aria-label="Undo"
            >
                Undo
            </Button>
            <Button
                size="sm"
                variant="outline"
                onClick={() => dispatch(REDO_COMMAND, undefined)}
                type="button"
                aria-label="Redo"
            >
                Redo
            </Button>
            <Button size="sm" variant="outline" onClick={() => formatText('bold')} type="button" aria-label="Bold">
                B
            </Button>
            <Button size="sm" variant="outline" onClick={() => formatText('italic')} type="button" aria-label="Italic">
                I
            </Button>
            <Button
                size="sm"
                variant="outline"
                onClick={() => formatText('underline')}
                type="button"
                aria-label="Underline"
            >
                U
            </Button>
            <Button
                size="sm"
                variant="outline"
                onClick={() => dispatch(INSERT_UNORDERED_LIST_COMMAND, undefined)}
                type="button"
                aria-label="Bulleted list"
            >
                •
            </Button>
            <Button
                size="sm"
                variant="outline"
                onClick={() => dispatch(INSERT_ORDERED_LIST_COMMAND, undefined)}
                type="button"
                aria-label="Numbered list"
            >
                1.
            </Button>
            <Button
                size="sm"
                variant="outline"
                onClick={() => formatText('code')}
                type="button"
                aria-label="Inline code"
            >
                {'<>'}
            </Button>
        </div>
    );
};

export default Toolbar;
