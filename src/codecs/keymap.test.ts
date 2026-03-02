import { describe, expect, it } from 'bun:test';

import { expandKeys, minifyKeys } from './keymap';

const sampleLexicalState = {
    root: {
        children: [
            {
                children: [
                    { detail: 0, format: 0, mode: 'normal', style: '', text: 'Hello', type: 'text', version: 1 },
                ],
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

describe('minifyKeys', () => {
    it('should shorten all known Lexical keys to their aliases', () => {
        const minified = minifyKeys(sampleLexicalState) as Record<string, unknown>;

        expect(minified.r).toBeDefined();
        expect(minified.root).toBeUndefined();
    });

    it('should pass through unknown keys unchanged', () => {
        const input = { custom: { root: { children: [] } } };
        const minified = minifyKeys(input) as Record<string, unknown>;

        expect(minified.custom).toBeDefined();
    });

    it('should handle deeply nested objects', () => {
        const input = { root: { children: [{ children: [{ text: 'nested' }] }] } };
        const minified = minifyKeys(input) as Record<string, unknown>;

        expect(minified.r).toBeDefined();
    });

    it('should handle arrays of nodes', () => {
        const input = {
            children: [
                { text: 'one', type: 'paragraph' },
                { text: 'two', type: 'paragraph' },
            ],
        };

        const minified = minifyKeys(input) as Record<string, unknown>;

        expect(Array.isArray(minified.c)).toBe(true);
    });
});

describe('expandKeys', () => {
    it('should restore all aliased keys to their full names', () => {
        const minified = minifyKeys(sampleLexicalState);
        const expanded = expandKeys(minified) as Record<string, unknown>;

        expect(expanded.root).toBeDefined();
    });

    it('should pass through unknown keys unchanged', () => {
        const input = { custom: { tx: 'kept' } };
        const expanded = expandKeys(input) as Record<string, unknown>;

        expect(expanded.custom).toEqual({ text: 'kept' });
    });
});

describe('value key', () => {
    it('should minify "value" to "vl" and expand back', () => {
        const input = { type: 'listitem', value: 1 };
        const minified = minifyKeys(input) as Record<string, unknown>;

        expect(minified.vl).toBe(1);
        expect(minified.value).toBeUndefined();

        const expanded = expandKeys(minified) as Record<string, unknown>;
        expect(expanded.value).toBe(1);
    });
});

describe('round-trip', () => {
    it('should produce identical output after minify then expand', () => {
        const output = expandKeys(minifyKeys(sampleLexicalState));

        expect(output).toEqual(sampleLexicalState);
    });

    it('should handle a realistic Lexical editor state', () => {
        const output = expandKeys(minifyKeys(sampleLexicalState));

        expect(output).toEqual(sampleLexicalState);
    });
});
