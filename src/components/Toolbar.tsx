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
        <div className="flex flex-wrap items-center gap-2 border-slate-700 border-b bg-slate-950/70 px-4 py-3">
            <Button size="sm" variant="outline" onClick={() => dispatch(UNDO_COMMAND, undefined)} type="button">
                Undo
            </Button>
            <Button size="sm" variant="outline" onClick={() => dispatch(REDO_COMMAND, undefined)} type="button">
                Redo
            </Button>
            <Button size="sm" variant="outline" onClick={() => formatText('bold')} type="button">
                B
            </Button>
            <Button size="sm" variant="outline" onClick={() => formatText('italic')} type="button">
                I
            </Button>
            <Button size="sm" variant="outline" onClick={() => formatText('underline')} type="button">
                U
            </Button>
            <Button
                size="sm"
                variant="outline"
                onClick={() => dispatch(INSERT_UNORDERED_LIST_COMMAND, undefined)}
                type="button"
            >
                •
            </Button>
            <Button
                size="sm"
                variant="outline"
                onClick={() => dispatch(INSERT_ORDERED_LIST_COMMAND, undefined)}
                type="button"
            >
                1.
            </Button>
            <Button size="sm" variant="outline" onClick={() => formatText('code')} type="button">
                {'<>'}
            </Button>
        </div>
    );
};

export default Toolbar;
