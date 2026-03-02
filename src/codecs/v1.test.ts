import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { SerializedEditorState } from 'lexical';

import { EMPTY_EDITOR_STATE } from '../editor/emptyState';
import { uint8ToBase64url } from './base64url';
import { CodecError } from './types';
import { COMPRESSOR_ID, FORMAT_VERSION, HEADER_SIZE, MAX_DECOMPRESSED_BYTES, REPR_FLAGS } from './v1-constants';

const sampleState: SerializedEditorState = {
    ...EMPTY_EDITOR_STATE,
    root: {
        ...EMPTY_EDITOR_STATE.root,
        children: [
            {
                children: [
                    { detail: 0, format: 0, mode: 'normal', style: '', text: 'Hello world '.repeat(50), type: 'text', version: 1 },
                ],
                direction: null,
                format: '',
                indent: 0,
                type: 'paragraph',
                version: 1,
            },
        ],
    },
};

const arabicState: SerializedEditorState = {
    ...EMPTY_EDITOR_STATE,
    root: {
        ...EMPTY_EDITOR_STATE.root,
        children: [
            {
                children: [
                    { detail: 0, format: 0, mode: 'normal', style: '', text: 'بسم الله الرحمن الرحيم', type: 'text', version: 1 },
                ],
                direction: 'rtl',
                format: '',
                indent: 0,
                type: 'paragraph',
                version: 1,
            },
        ],
    },
};

const emojiState: SerializedEditorState = {
    ...EMPTY_EDITOR_STATE,
    root: {
        ...EMPTY_EDITOR_STATE.root,
        children: [
            {
                children: [
                    { detail: 0, format: 0, mode: 'normal', style: '', text: 'Hello 👋🏽 World 🌍 مرحبا', type: 'text', version: 1 },
                ],
                direction: null,
                format: '',
                indent: 0,
                type: 'paragraph',
                version: 1,
            },
        ],
    },
};

const complexState: SerializedEditorState = {
    ...EMPTY_EDITOR_STATE,
    root: {
        ...EMPTY_EDITOR_STATE.root,
        children: [
            {
                children: [
                    { detail: 0, format: 1, mode: 'normal', style: '', text: 'Bold heading', type: 'text', version: 1 },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                tag: 'h1',
                type: 'heading',
                version: 1,
            },
            {
                children: [
                    { detail: 0, format: 0, mode: 'normal', style: '', text: 'A paragraph with ', type: 'text', version: 1 },
                    { detail: 0, format: 2, mode: 'normal', style: '', text: 'italic', type: 'text', version: 1 },
                    { detail: 0, format: 0, mode: 'normal', style: '', text: ' text.', type: 'text', version: 1 },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'paragraph',
                version: 1,
            },
            {
                children: [
                    { detail: 0, format: 0, mode: 'normal', style: '', text: 'const x = 42;', type: 'text', version: 1 },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                language: 'typescript',
                type: 'code',
                version: 1,
            },
            { type: 'linebreak', version: 1 },
        ],
    },
};

beforeEach(() => {
    mock.restore();
});

const makeBrotliMock = () => ({
    compress: (input: Uint8Array) => new Uint8Array(deflateRawSync(input)),
    decompress: (input: Uint8Array) => new Uint8Array(inflateRawSync(input)),
});

const mockBrotliAvailable = () => {
    const brotliMock = makeBrotliMock();
    mock.module('../lib/compression', () => ({
        getBrotliIfAvailable: async () => brotliMock,
        getDeflateCompressor: () => ({
            codec: 'deflate',
            compress: async (input: Uint8Array) => new Uint8Array(deflateRawSync(input)),
            decompress: async (input: Uint8Array) => new Uint8Array(inflateRawSync(input)),
        }),
    }));
};

const mockBrotliUnavailable = () => {
    mock.module('../lib/compression', () => ({
        getBrotliIfAvailable: async () => null,
        getDeflateCompressor: () => ({
            codec: 'deflate',
            compress: async (input: Uint8Array) => new Uint8Array(deflateRawSync(input)),
            decompress: async (input: Uint8Array) => new Uint8Array(inflateRawSync(input)),
        }),
    }));
};

// ---- Encoding ----

describe('v1.encode', () => {
    it('should return a valid Base64url string', async () => {
        mockBrotliAvailable();
        const { encode } = await import(`./v1?case=${Math.random()}`);

        const output = await encode(sampleState);

        expect(/^[A-Za-z0-9_-]+$/.test(output)).toBe(true);
    });

    it('should produce output smaller than raw JSON', async () => {
        mockBrotliAvailable();
        const { encode } = await import(`./v1?case=${Math.random()}`);

        const output = await encode(sampleState);

        expect(output.length).toBeLessThan(JSON.stringify(sampleState).length);
    });

    it('should prepend a 3-byte header with Brotli compressor ID', async () => {
        mockBrotliAvailable();
        const { encode } = await import(`./v1?case=${Math.random()}`);
        const { base64urlToUint8 } = await import('./base64url');

        const output = await encode(sampleState);
        const raw = base64urlToUint8(output);

        expect(raw[0]).toBe(FORMAT_VERSION);
        expect(raw[1]).toBe(COMPRESSOR_ID.BROTLI);
        expect(raw[2]).toBe(REPR_FLAGS.LEXICAL_JSON);
    });

    it('should fall back to deflate-raw and set header when Brotli unavailable', async () => {
        mockBrotliUnavailable();
        const { encode } = await import(`./v1?case=${Math.random()}`);
        const { base64urlToUint8 } = await import('./base64url');

        const output = await encode(sampleState);
        const raw = base64urlToUint8(output);

        expect(raw[0]).toBe(FORMAT_VERSION);
        expect(raw[1]).toBe(COMPRESSOR_ID.DEFLATE_RAW);
        expect(raw[2]).toBe(REPR_FLAGS.LEXICAL_JSON);
    });
});

// ---- Decoding ----

describe('v1.decode', () => {
    it('should throw CodecError on empty string', async () => {
        mockBrotliAvailable();
        const { decode } = await import(`./v1?case=${Math.random()}`);

        await expect(decode('')).rejects.toBeInstanceOf(CodecError);
        await expect(decode('  ')).rejects.toBeInstanceOf(CodecError);
    });

    it('should throw CodecError on invalid base64url characters', async () => {
        mockBrotliAvailable();
        const { decode } = await import(`./v1?case=${Math.random()}`);

        await expect(decode('###not-valid###')).rejects.toBeInstanceOf(CodecError);
    });

    it('should throw CodecError on truncated payload (< 3 bytes)', async () => {
        mockBrotliAvailable();
        const { decode } = await import(`./v1?case=${Math.random()}`);

        const twoBytes = uint8ToBase64url(new Uint8Array([0x01, 0x01]));
        await expect(decode(twoBytes)).rejects.toThrow(/truncated/);
    });

    it('should throw CodecError on unsupported format version', async () => {
        mockBrotliAvailable();
        const { decode } = await import(`./v1?case=${Math.random()}`);

        const bad = uint8ToBase64url(new Uint8Array([0xFF, 0x01, 0x00, 0x00]));
        await expect(decode(bad)).rejects.toThrow(/newer version/);
    });

    it('should throw CodecError on unsupported compressor ID', async () => {
        mockBrotliAvailable();
        const { decode } = await import(`./v1?case=${Math.random()}`);

        const bad = uint8ToBase64url(new Uint8Array([0x01, 0xFF, 0x00, 0x00]));
        await expect(decode(bad)).rejects.toThrow(/unsupported compression/);
    });

    it('should throw CodecError on unsupported repr flags', async () => {
        mockBrotliAvailable();
        const { decode } = await import(`./v1?case=${Math.random()}`);

        const bad = uint8ToBase64url(new Uint8Array([0x01, 0x01, 0xFF, 0x00]));
        await expect(decode(bad)).rejects.toThrow(/unsupported representation/);
    });

    it('should throw CodecError when Brotli payload but WASM unavailable', async () => {
        mockBrotliAvailable();
        const { encode } = await import(`./v1?case=${Math.random()}`);
        const encoded = await encode(sampleState);

        mockBrotliUnavailable();
        const { decode } = await import(`./v1?case2=${Math.random()}`);

        await expect(decode(encoded)).rejects.toThrow(/WASM module/);
    });

    it('should throw CodecError on corrupted compressed data', async () => {
        mockBrotliAvailable();
        const { decode } = await import(`./v1?case=${Math.random()}`);

        const header = new Uint8Array([FORMAT_VERSION, COMPRESSOR_ID.BROTLI, REPR_FLAGS.LEXICAL_JSON]);
        const garbage = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
        const payload = new Uint8Array(header.length + garbage.length);
        payload.set(header);
        payload.set(garbage, header.length);

        await expect(decode(uint8ToBase64url(payload))).rejects.toThrow(/corrupted/);
    });

    it('should throw CodecError on decompression bomb (> 2MB decompressed)', async () => {
        const bigData = JSON.stringify({ root: { children: [], type: 'root' } }).padEnd(MAX_DECOMPRESSED_BYTES + 1, ' ');
        const compressed = deflateRawSync(Buffer.from(bigData));
        const header = new Uint8Array([FORMAT_VERSION, COMPRESSOR_ID.DEFLATE_RAW, REPR_FLAGS.LEXICAL_JSON]);
        const payload = new Uint8Array(header.length + compressed.length);
        payload.set(header);
        payload.set(new Uint8Array(compressed), header.length);

        mockBrotliUnavailable();
        const { decode } = await import(`./v1?case=${Math.random()}`);

        await expect(decode(uint8ToBase64url(payload))).rejects.toThrow(/maximum supported size/);
    });
});

// ---- Round-trip ----

describe('v1 round-trip', () => {
    it('should round-trip the empty editor state', async () => {
        mockBrotliAvailable();
        const { decode, encode } = await import(`./v1?case=${Math.random()}`);

        expect(await decode(await encode(EMPTY_EDITOR_STATE))).toEqual(EMPTY_EDITOR_STATE);
    });

    it('should round-trip a sample document with Brotli', async () => {
        mockBrotliAvailable();
        const { decode, encode } = await import(`./v1?case=${Math.random()}`);

        expect(await decode(await encode(sampleState))).toEqual(sampleState);
    });

    it('should round-trip a sample document with deflate fallback', async () => {
        mockBrotliUnavailable();
        const { decode, encode } = await import(`./v1?case=${Math.random()}`);

        expect(await decode(await encode(sampleState))).toEqual(sampleState);
    });

    it('should round-trip Arabic RTL text', async () => {
        mockBrotliAvailable();
        const { decode, encode } = await import(`./v1?case=${Math.random()}`);

        expect(await decode(await encode(arabicState))).toEqual(arabicState);
    });

    it('should round-trip emoji and mixed-script content', async () => {
        mockBrotliAvailable();
        const { decode, encode } = await import(`./v1?case=${Math.random()}`);

        expect(await decode(await encode(emojiState))).toEqual(emojiState);
    });

    it('should round-trip a complex document with headings, code, linebreaks', async () => {
        mockBrotliAvailable();
        const { decode, encode } = await import(`./v1?case=${Math.random()}`);

        expect(await decode(await encode(complexState))).toEqual(complexState);
    });

    it('should round-trip documents with formatted text (bold, italic)', async () => {
        mockBrotliAvailable();
        const { decode, encode } = await import(`./v1?case=${Math.random()}`);

        const formatted: SerializedEditorState = {
            ...EMPTY_EDITOR_STATE,
            root: {
                ...EMPTY_EDITOR_STATE.root,
                children: [
                    {
                        children: [
                            { detail: 0, format: 1, mode: 'normal', style: '', text: 'bold', type: 'text', version: 1 },
                            { detail: 0, format: 2, mode: 'normal', style: '', text: 'italic', type: 'text', version: 1 },
                            { detail: 0, format: 3, mode: 'normal', style: '', text: 'bold+italic', type: 'text', version: 1 },
                        ],
                        direction: 'ltr',
                        format: '',
                        indent: 0,
                        type: 'paragraph',
                        version: 1,
                    },
                ],
            },
        };

        expect(await decode(await encode(formatted))).toEqual(formatted);
    });

    it('should round-trip documents with code blocks and special whitespace', async () => {
        mockBrotliAvailable();
        const { decode, encode } = await import(`./v1?case=${Math.random()}`);

        const codeState: SerializedEditorState = {
            ...EMPTY_EDITOR_STATE,
            root: {
                ...EMPTY_EDITOR_STATE.root,
                children: [
                    {
                        children: [
                            {
                                detail: 0,
                                format: 0,
                                mode: 'normal',
                                style: '',
                                text: 'const x = 1;\n\treturn x;',
                                type: 'text',
                                version: 1,
                            },
                        ],
                        direction: null,
                        format: '',
                        indent: 0,
                        type: 'paragraph',
                        version: 1,
                    },
                ],
            },
        };

        expect(await decode(await encode(codeState))).toEqual(codeState);
    });

    it('should preserve unknown fields on nodes', async () => {
        mockBrotliAvailable();
        const { decode, encode } = await import(`./v1?case=${Math.random()}`);

        const withCustom: SerializedEditorState = {
            ...EMPTY_EDITOR_STATE,
            root: {
                ...EMPTY_EDITOR_STATE.root,
                children: [
                    {
                        children: [],
                        customPlugin: 'data',
                        direction: null,
                        format: '',
                        indent: 0,
                        type: 'paragraph',
                        version: 1,
                        zIndex: 42,
                    },
                ],
            },
        } as SerializedEditorState;

        expect(await decode(await encode(withCustom))).toEqual(withCustom);
    });
});

// ---- Golden-file: header byte layout ----

describe('v1 header', () => {
    it('should have exactly 3-byte header at the start of encoded payloads', async () => {
        mockBrotliAvailable();
        const { encode } = await import(`./v1?case=${Math.random()}`);
        const { base64urlToUint8 } = await import('./base64url');

        const output = await encode(EMPTY_EDITOR_STATE);
        const raw = base64urlToUint8(output);

        expect(raw.length).toBeGreaterThan(HEADER_SIZE);
        expect(raw[0]).toBe(0x01);
        expect(raw[1]).toBe(0x01);
        expect(raw[2]).toBe(0x00);
    });
});
