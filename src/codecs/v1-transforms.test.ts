import { describe, expect, it } from 'bun:test';

import { KEY_MAP } from './keymap';
import { VALUE_MAP } from './v1-constants';
import { expandValues, minifyValues, restoreDefaults, stripDefaults } from './v1-transforms';

// ---- Helpers ----

const textNode = (text: string, overrides?: Record<string, unknown>) => ({
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
    ...overrides,
});

const paragraphNode = (children: unknown[], dir: 'ltr' | 'rtl' | null = null) => ({
    children,
    direction: dir,
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1,
});

const headingNode = (tag: string, children: unknown[], dir: 'ltr' | 'rtl' | null = 'ltr') => ({
    children,
    direction: dir,
    format: '',
    indent: 0,
    tag,
    type: 'heading',
    version: 1,
});

const codeNode = (code: string, language = 'javascript') => ({
    children: [textNode(code)],
    direction: 'ltr',
    format: '',
    indent: 0,
    language,
    type: 'code',
    version: 1,
});

const linkNode = (url: string, children: unknown[]) => ({
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    rel: 'noreferrer',
    target: '_blank',
    title: '',
    type: 'link',
    url,
    version: 1,
});

const listNode = (listType: string, children: unknown[]) => ({
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    listType,
    start: 1,
    tag: 'ul',
    type: 'list',
    version: 1,
});

const listitemNode = (children: unknown[], value = 1) => ({
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'listitem',
    value,
    version: 1,
});

const quoteNode = (children: unknown[]) => ({
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'quote',
    version: 1,
});

const linebreakNode = () => ({ type: 'linebreak', version: 1 });

const tabNode = () => ({ detail: 0, format: 0, mode: 'normal', style: '', text: '\t', type: 'tab', version: 1 });

const wrapRoot = (children: unknown[]) => ({
    root: { children, direction: null, format: '', indent: 0, type: 'root', version: 1 },
});

// ---- stripDefaults / restoreDefaults ----

describe('stripDefaults', () => {
    it('should strip common defaults from paragraph nodes', () => {
        const node = paragraphNode([textNode('hello')]);
        const stripped = stripDefaults(node) as Record<string, unknown>;

        expect(stripped.version).toBeUndefined();
        expect(stripped.indent).toBeUndefined();
        expect(stripped.type).toBe('paragraph');
    });

    it('should strip text node defaults (format:0, detail:0, mode:normal, style:"")', () => {
        const node = textNode('hello');
        const stripped = stripDefaults(node) as Record<string, unknown>;

        expect(stripped.format).toBeUndefined();
        expect(stripped.detail).toBeUndefined();
        expect(stripped.mode).toBeUndefined();
        expect(stripped.style).toBeUndefined();
        expect(stripped.text).toBe('hello');
        expect(stripped.type).toBe('text');
    });

    it('should strip element defaults (direction:null, format:"")', () => {
        const node = paragraphNode([textNode('hello')]);
        const stripped = stripDefaults(node) as Record<string, unknown>;

        expect(stripped.direction).toBeUndefined();
        expect(stripped.format).toBeUndefined();
    });

    it('should preserve non-default values on text nodes', () => {
        const node = textNode('bold', { format: 1 });
        const stripped = stripDefaults(node) as Record<string, unknown>;

        expect(stripped.format).toBe(1);
    });

    it('should preserve non-default direction on element nodes', () => {
        const node = paragraphNode([textNode('مرحبا')], 'rtl');
        const stripped = stripDefaults(node) as Record<string, unknown>;

        expect(stripped.direction).toBe('rtl');
    });

    it('should handle root wrapper object', () => {
        const doc = wrapRoot([paragraphNode([textNode('hello')])]);
        const stripped = stripDefaults(doc) as Record<string, unknown>;

        expect(stripped).toHaveProperty('root');
    });
});

describe('restoreDefaults', () => {
    it('should restore stripped text node defaults', () => {
        const stripped = { text: 'hello', type: 'text' };
        const restored = restoreDefaults(stripped) as Record<string, unknown>;

        expect(restored.version).toBe(1);
        expect(restored.detail).toBe(0);
        expect(restored.format).toBe(0);
        expect(restored.mode).toBe('normal');
        expect(restored.style).toBe('');
        expect(restored.indent).toBeUndefined();
    });

    it('should restore stripped element node defaults', () => {
        const stripped = { children: [], type: 'paragraph' };
        const restored = restoreDefaults(stripped) as Record<string, unknown>;

        expect(restored.version).toBe(1);
        expect(restored.indent).toBe(0);
        expect(restored.format).toBe('');
        expect(restored.direction).toBeNull();
    });

    it('should NOT add text-specific defaults to element nodes', () => {
        const stripped = { children: [], type: 'paragraph' };
        const restored = restoreDefaults(stripped) as Record<string, unknown>;

        expect(restored.detail).toBeUndefined();
        expect(restored.mode).toBeUndefined();
        expect(restored.style).toBeUndefined();
    });

    it('should NOT add element-specific defaults to text nodes', () => {
        const stripped = { text: 'hi', type: 'text' };
        const restored = restoreDefaults(stripped) as Record<string, unknown>;

        expect(restored.direction).toBeUndefined();
    });
});

describe('stripDefaults / restoreDefaults round-trip', () => {
    const roundTrip = (doc: unknown) => restoreDefaults(stripDefaults(doc));

    it('should round-trip a paragraph node', () => {
        const doc = wrapRoot([paragraphNode([textNode('hello')], 'ltr')]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip a heading node', () => {
        const doc = wrapRoot([headingNode('h1', [textNode('Title')])]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip a code node', () => {
        const doc = wrapRoot([codeNode('const x = 1;')]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip a link node', () => {
        const doc = wrapRoot([paragraphNode([linkNode('https://example.com', [textNode('click')])])]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip a list with nested items', () => {
        const doc = wrapRoot([
            listNode('bullet', [listitemNode([paragraphNode([textNode('item 1')])]), listitemNode([paragraphNode([textNode('item 2')])])]),
        ]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip a quote node', () => {
        const doc = wrapRoot([quoteNode([textNode('quoted text')])]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip a linebreak node', () => {
        const doc = wrapRoot([paragraphNode([textNode('before'), linebreakNode(), textNode('after')])]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip a tab node', () => {
        const doc = wrapRoot([paragraphNode([tabNode(), textNode('indented')])]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip formatted text (bold, italic)', () => {
        const doc = wrapRoot([paragraphNode([textNode('bold', { format: 1 }), textNode('italic', { format: 2 })])]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip Arabic RTL text', () => {
        const doc = wrapRoot([paragraphNode([textNode('بسم الله الرحمن الرحيم')], 'rtl')]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip emoji content', () => {
        const doc = wrapRoot([paragraphNode([textNode('Hello 👋🏽 World 🌍')])]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip mixed Arabic and English', () => {
        const doc = wrapRoot([
            paragraphNode([textNode('Hello مرحبا World')], 'ltr'),
            paragraphNode([textNode('مرحبا Hello عالم')], 'rtl'),
        ]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip the empty editor state', () => {
        const doc = {
            root: {
                children: [
                    {
                        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: '', type: 'text', version: 1 }],
                        direction: null,
                        format: '',
                        indent: 0,
                        type: 'paragraph',
                        version: 1,
                    },
                ],
                direction: null,
                format: '',
                indent: 0,
                type: 'root',
                version: 1,
            },
        };
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should preserve unknown fields on known node types', () => {
        const doc = wrapRoot([{ ...paragraphNode([textNode('test')]), customPlugin: 'data', zIndex: 42 }]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should preserve unknown node types entirely', () => {
        const doc = wrapRoot([
            {
                children: [textNode('custom')],
                customAttr: true,
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'my-custom-node',
                version: 1,
            },
        ]);
        expect(roundTrip(doc)).toEqual(doc);
    });

    it('should round-trip a complex document with all node types', () => {
        const doc = wrapRoot([
            headingNode('h1', [textNode('Title', { format: 1 })]),
            paragraphNode([textNode('Normal text'), linebreakNode(), textNode('after break')], 'ltr'),
            paragraphNode([textNode('بسم الله')], 'rtl'),
            codeNode('function hello() {}', 'typescript'),
            listNode('bullet', [
                listitemNode([paragraphNode([textNode('first')])]),
                listitemNode([paragraphNode([textNode('second')])]),
            ]),
            quoteNode([textNode('A wise quote')]),
            paragraphNode([linkNode('https://example.com', [textNode('Link text')])]),
        ]);
        expect(roundTrip(doc)).toEqual(doc);
    });
});

// ---- minifyValues / expandValues ----

describe('minifyValues', () => {
    it('should minify type values on the "t" key', () => {
        const input = { t: 'paragraph' };
        expect(minifyValues(input)).toEqual({ t: 'p' });
    });

    it('should minify direction values on the "d" key', () => {
        expect(minifyValues({ d: 'rtl' })).toEqual({ d: 'R' });
        expect(minifyValues({ d: 'ltr' })).toEqual({ d: 'L' });
    });

    it('should minify mode values on the "m" key', () => {
        const input = { m: 'normal' };
        expect(minifyValues(input)).toEqual({ m: 'n' });
    });

    it('should minify listType values on the "lt" key', () => {
        const input = { lt: 'bullet' };
        expect(minifyValues(input)).toEqual({ lt: 'b' });
    });

    it('should NOT minify values on unrecognized keys', () => {
        const input = { tx: 'paragraph' };
        expect(minifyValues(input)).toEqual({ tx: 'paragraph' });
    });

    it('should NOT minify user text content that happens to match a value alias', () => {
        const input = { tx: 'p' };
        expect(minifyValues(input)).toEqual({ tx: 'p' });
    });

    it('should handle nested objects recursively', () => {
        const input = { c: [{ t: 'text', m: 'normal' }], t: 'paragraph' };
        expect(minifyValues(input)).toEqual({ c: [{ m: 'n', t: 'x' }], t: 'p' });
    });

    it('should pass through unknown values unchanged', () => {
        const input = { t: 'my-custom-node' };
        expect(minifyValues(input)).toEqual({ t: 'my-custom-node' });
    });
});

describe('expandValues', () => {
    it('should expand minified type values', () => {
        const input = { t: 'p' };
        expect(expandValues(input)).toEqual({ t: 'paragraph' });
    });

    it('should expand minified direction values', () => {
        const input = { d: 'R' };
        expect(expandValues(input)).toEqual({ d: 'rtl' });
    });

    it('should expand nested values recursively', () => {
        const input = { c: [{ m: 'n', t: 'x' }], t: 'p' };
        expect(expandValues(input)).toEqual({ c: [{ m: 'normal', t: 'text' }], t: 'paragraph' });
    });

    it('should pass through unknown aliases unchanged', () => {
        const input = { t: 'zz' };
        expect(expandValues(input)).toEqual({ t: 'zz' });
    });
});

describe('minifyValues / expandValues round-trip', () => {
    it('should round-trip a minified Lexical structure', () => {
        const input = {
            c: [
                {
                    c: [{ m: 'normal', t: 'text', tx: 'hello' }],
                    d: 'ltr',
                    t: 'paragraph',
                },
            ],
            t: 'root',
        };
        expect(expandValues(minifyValues(input))).toEqual(input);
    });
});

// ---- Object.prototype safety ----

describe('Object.prototype safety', () => {
    it('should not corrupt text containing "toString"', () => {
        const doc = wrapRoot([paragraphNode([textNode('toString')])]);
        const roundTripped = restoreDefaults(stripDefaults(doc));
        expect(roundTripped).toEqual(doc);
    });

    it('should not corrupt text containing "constructor"', () => {
        const doc = wrapRoot([paragraphNode([textNode('constructor')])]);
        const roundTripped = restoreDefaults(stripDefaults(doc));
        expect(roundTripped).toEqual(doc);
    });

    it('should not corrupt text containing "valueOf"', () => {
        const doc = wrapRoot([paragraphNode([textNode('valueOf')])]);
        const roundTripped = restoreDefaults(stripDefaults(doc));
        expect(roundTripped).toEqual(doc);
    });

    it('should not corrupt nodes with prototype-named custom fields', () => {
        const doc = wrapRoot([
            { ...paragraphNode([textNode('test')]), constructor: 'custom', toString: 'data' },
        ]);
        const roundTripped = restoreDefaults(stripDefaults(doc));
        expect(roundTripped).toEqual(doc);
    });

    it('should not corrupt value minification with prototype keys', () => {
        const input = { t: 'toString' };
        const result = minifyValues(input);
        expect(result).toEqual({ t: 'toString' });
    });

    it('should not corrupt value expansion with prototype keys', () => {
        const input = { t: 'constructor' };
        const result = expandValues(input);
        expect(result).toEqual({ t: 'constructor' });
    });
});

// ---- Collision invariants ----

describe('collision safety', () => {
    it('should have no collisions between KEY_MAP aliases and VALUE_MAP aliases', () => {
        const keyAliases = new Set(Object.values(KEY_MAP));
        for (const fieldMap of Object.values(VALUE_MAP)) {
            for (const [original, alias] of Object.entries(fieldMap)) {
                if (keyAliases.has(alias)) {
                    throw new Error(`VALUE_MAP alias "${alias}" (from "${original}") collides with KEY_MAP alias`);
                }
            }
        }
    });

    it('should have unique aliases within each VALUE_MAP field', () => {
        for (const [field, map] of Object.entries(VALUE_MAP)) {
            const aliases = Object.values(map);
            const unique = new Set(aliases);
            expect(unique.size).toBe(aliases.length);
            if (unique.size !== aliases.length) {
                throw new Error(`Duplicate aliases in VALUE_MAP["${field}"]`);
            }
        }
    });
});
