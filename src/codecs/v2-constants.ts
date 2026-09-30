// V2 wire contract. Never change assigned tags/defaults: add a new codec version instead.
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_DEPTH = 64;
export const MAX_CONTAINERS = 20_000;
export const MAX_FRAGMENT_CHARS = MAX_BYTES * 3 + 32;
export const WORKER_DEADLINE_MS = 2_000;
export const SHARE_TARGET_MS = 500;
export const CM_MAX_BYTES = 128 * 1024;
export const CM_MAX_MODEL_BYTES = 16 * 1024 * 1024;
export const BINARY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export type Representation = 'json' | 'v1' | 'text' | 'compact' | 'tuples' | 'split' | 'markdown';
export type UnicodeTransform = 'utf8' | 'window8';
export type Compression = 'raw' | 'deflate' | 'brotli' | 'cm';
export type Mode = Readonly<{
    tag: string;
    representation: Representation;
    unicode: UnicodeTransform;
    compression: Compression;
}>;

// Each row explicitly assigns: UTF-8 raw/deflate/Brotli/CM, window8 raw/deflate/Brotli/CM.
// 4..9, -, _ remain unassigned. The '.' literal mode is outside the binary alphabet.
const rows: readonly (readonly [Representation, string])[] = [
    ['json', 'ABCDEFGH'],
    ['v1', 'IJKLMNOP'],
    ['text', 'QRSTUVWX'],
    ['compact', 'YZabcdef'],
    ['tuples', 'ghijklmn'],
    ['split', 'opqrstuv'],
    ['markdown', 'wxyz0123'],
];
export const MODES: readonly Mode[] = Object.freeze(
    rows.flatMap(([representation, tags]) =>
        [...tags].map((tag, i) =>
            Object.freeze({
                compression: (['raw', 'deflate', 'brotli', 'cm'] as const)[i % 4],
                representation,
                tag,
                unicode: (i < 4 ? 'utf8' : 'window8') as UnicodeTransform,
            }),
        ),
    ),
);
export const MODE_BY_TAG: Readonly<Record<string, Mode>> = Object.freeze(
    Object.fromEntries(MODES.map((m) => [m.tag, m])),
);

// Independent of Lexical's current/future defaults and independent of the v1 constants.
export const ELEMENT_DEFAULTS = Object.freeze({ direction: null, format: '', indent: 0, version: 1 });
export const TEXT_DEFAULTS = Object.freeze({ detail: 0, format: 0, mode: 'normal', style: '', version: 1 });
export const PARAGRAPH_DEFAULTS = Object.freeze({ ...ELEMENT_DEFAULTS, textFormat: 0, textStyle: '' });
export const KINDS = Object.freeze([
    'root',
    'paragraph',
    'text',
    'heading',
    'quote',
    'list',
    'listitem',
    'link',
    'code',
    'code-highlight',
    'linebreak',
    'tab',
] as const);
export const TEXT_KINDS: ReadonlySet<string> = new Set(['text', 'code-highlight', 'tab']);
export const SPLIT_REF = 14;
export const VERBATIM = 15;
export const BROTLI_QUALITIES = Object.freeze([4, 6, 9, 10, 11] as const);

// Release gate: this delivery cannot certify installed-WASM/React/mobile acceptance.
// Environment opt-ins are for qualification, NOT evidence of a passed release gate.
export const RELEASE_QUALIFIED = false;
export const CM_QUALIFIED = false;
