// Frozen constants for the v1 codec (v2-compact payload format).
// APPEND-ONLY. Never remove or change existing values.
// If Lexical changes defaults, bump FORMAT_VERSION and create new restore logic.

// --- Header ---

export const HEADER_SIZE = 3;
export const FORMAT_VERSION = 0x01;

export const COMPRESSOR_ID = {
    BROTLI: 0x01,
    DEFLATE_RAW: 0x00,
} as const;

export const REPR_FLAGS = {
    LEXICAL_JSON: 0x00,
} as const;

export const BROTLI_QUALITY = 11;

export const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024;

// --- Lexical node defaults — validated against @lexical/core v0.41.0 ---
// NEVER change these. If Lexical changes defaults, bump FORMAT_VERSION.
//
// Lexical node hierarchy:
//   TextNode (text, code-highlight, tab): detail, format(number), mode, style, text, type, version
//   ElementNode (paragraph, heading, root, list, listitem, quote, link, code): children, direction, format(string), indent, type, version
//   LexicalNode (linebreak): type, version

export const TEXT_NODE_DEFAULTS: Record<string, unknown> = {
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    version: 1,
};

export const ELEMENT_NODE_DEFAULTS: Record<string, unknown> = {
    direction: null,
    format: '',
    indent: 0,
    version: 1,
};

export const BARE_NODE_DEFAULTS: Record<string, unknown> = {
    version: 1,
};

export const TEXT_TYPES: ReadonlySet<string> = new Set(['text', 'code-highlight', 'tab']);
export const BARE_TYPES: ReadonlySet<string> = new Set(['linebreak']);

// --- Value minification maps ---
// Keys here are MINIFIED key names (after key minification).
// APPEND-ONLY. Never remove or change existing mappings.
// Aliases must NOT collide with KEY_MAP aliases (see collision invariant test).

export const VALUE_MAP: Record<string, Record<string, string>> = {
    d: { ltr: 'L', rtl: 'R' },
    lt: { bullet: 'b', check: 'ck', number: 'n' },
    m: { normal: 'n', segmented: 'sg', token: 'tk' },
    t: {
        code: 'cd',
        'code-highlight': 'ch',
        heading: 'h',
        linebreak: 'lb',
        link: 'lk',
        list: 'l',
        listitem: 'li',
        paragraph: 'p',
        quote: 'q',
        root: 'ro',
        tab: 'tb',
        text: 'x',
    },
};

export const REVERSE_VALUE_MAP: Readonly<Record<string, Record<string, string>>> = Object.freeze(
    Object.fromEntries(
        Object.entries(VALUE_MAP).map(([field, map]) => [
            field,
            Object.freeze(Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]))),
        ]),
    ),
);
