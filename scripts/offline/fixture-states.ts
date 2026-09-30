// Supplemental states: frozen v2 grammar, NOT actual Lexical exports of the historical corpus.
import { readFileSync } from 'node:fs';
import { developmentSources, evaluationSources } from '../compression/fixtures';
import { plainState } from '../../src/codecs/v2-representations';
import { ELEMENT_DEFAULTS, PARAGRAPH_DEFAULTS, TEXT_DEFAULTS } from '../../src/codecs/v2-constants';
import type { Obj } from '../../src/codecs/v2-json';
export const plainWithCodeUnits = (text: string): Obj => ({ root: { ...ELEMENT_DEFAULTS, type: 'root', children: text.split('\n').map(line => ({
    ...PARAGRAPH_DEFAULTS, type: 'paragraph', children: line ? [{ ...TEXT_DEFAULTS, type: 'text', text: line }] : [],
})) } });
export const offlineFixtures = () => {
    const rich = JSON.parse(readFileSync(new URL('../../tests/fixtures/rich-state.json', import.meta.url), 'utf8'));
    const evaluationRich = JSON.parse(readFileSync(new URL('../../tests/fixtures/evaluation-rich-states.json', import.meta.url), 'utf8'));
    return [
        ...developmentSources().filter(source => source.kind === 'plain').map(source => ({ ...source, state: plainWithCodeUnits(source.text) })),
        { id: 'supplemental-rich', name: 'Frozen v2 rich grammar specimen', set: 'development' as const, state: rich },
        { id: 'supplemental-style', name: 'Rich grammar with style and RTL metadata', set: 'development' as const, state: {
            ...rich, root: { ...rich.root, children: [...rich.root.children, { ...PARAGRAPH_DEFAULTS, type: 'paragraph', direction: 'rtl', indent: 2, format: 'right',
                children: [{ ...TEXT_DEFAULTS, type: 'text', text: 'Styled content', style: 'color: red; font-size: 20px;', format: 3 }] }] },
        } },
        ...evaluationSources().map(source => ({ ...source, state: source.kind === 'plain' ? plainWithCodeUnits(source.text) : evaluationRich[source.id] })),
        { id: 'supplemental-empty-root', name: 'Empty root is not an empty paragraph', set: 'development' as const, state: { root: { ...ELEMENT_DEFAULTS, type: 'root', children: [] } } },
        { id: 'supplemental-alias', name: 'Unknown field and alias collision', set: 'development' as const, state: { ...plainState('metadata'), rootExtra: { text: 'long', tx: 'short', t: 'p', type: 'future-node' } } },
    ];
};
