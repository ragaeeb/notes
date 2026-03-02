import type { SerializedEditorState } from 'lexical';
import { getBrotliIfAvailable, getDeflateCompressor } from '../lib/compression';
import { base64urlToUint8, uint8ToBase64url } from './base64url';
import { expandKeys, minifyKeys } from './keymap';
import { CodecError, type CompressorId, type PayloadHeader } from './types';
import {
    BROTLI_QUALITY,
    COMPRESSOR_ID,
    FORMAT_VERSION,
    HEADER_SIZE,
    MAX_DECOMPRESSED_BYTES,
    REPR_FLAGS,
} from './v1-constants';
import { expandValues, minifyValues, restoreDefaults, stripDefaults } from './v1-transforms';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const isSerializedEditorState = (value: unknown): value is SerializedEditorState =>
    typeof value === 'object' &&
    value !== null &&
    'root' in value &&
    typeof (value as Record<string, unknown>).root === 'object' &&
    (value as Record<string, unknown>).root !== null;

const makeHeader = (compressorId: CompressorId): Uint8Array =>
    new Uint8Array([FORMAT_VERSION, compressorId, REPR_FLAGS.LEXICAL_JSON]);

const readHeader = (data: Uint8Array): PayloadHeader => {
    if (data.length < HEADER_SIZE) {
        throw new CodecError('This share link appears to be truncated or corrupted.');
    }

    const formatVersion = data[0];
    if (formatVersion !== FORMAT_VERSION) {
        throw new CodecError('This share link was created with a newer version of the app. Please update to view it.');
    }

    const compressorId = data[1] as CompressorId;
    if (compressorId !== COMPRESSOR_ID.BROTLI && compressorId !== COMPRESSOR_ID.DEFLATE_RAW) {
        throw new CodecError('This share link uses an unsupported compression format.');
    }

    const reprFlags = data[2];
    if (reprFlags !== REPR_FLAGS.LEXICAL_JSON) {
        throw new CodecError('This share link uses an unsupported representation format.');
    }

    return { compressorId, formatVersion, reprFlags };
};

export const encode = async (state: SerializedEditorState): Promise<string> => {
    if (!isSerializedEditorState(state)) {
        throw new CodecError('Cannot share: invalid editor state.');
    }

    const stripped = stripDefaults(state);
    const minifiedKeys = minifyKeys(stripped);
    const minifiedValues = minifyValues(minifiedKeys);
    const json = JSON.stringify(minifiedValues);
    const raw = textEncoder.encode(json);

    const brotli = await getBrotliIfAvailable();
    let compressed: Uint8Array;
    let compressorId: CompressorId;

    if (brotli) {
        compressed = brotli.compress(raw, { quality: BROTLI_QUALITY });
        compressorId = COMPRESSOR_ID.BROTLI;
    } else {
        const deflate = getDeflateCompressor();
        compressed = await deflate.compress(raw);
        compressorId = COMPRESSOR_ID.DEFLATE_RAW;
    }

    const header = makeHeader(compressorId);
    const payload = new Uint8Array(HEADER_SIZE + compressed.length);
    payload.set(header, 0);
    payload.set(compressed, HEADER_SIZE);

    return uint8ToBase64url(payload);
};

export const decode = async (hash: string): Promise<SerializedEditorState> => {
    if (!hash.trim()) {
        throw new CodecError('Cannot load document: the share link is empty.');
    }

    let data: Uint8Array;
    try {
        data = base64urlToUint8(hash);
    } catch {
        throw new CodecError('This share link contains invalid characters and cannot be loaded.');
    }

    const header = readHeader(data);
    const compressed = data.subarray(HEADER_SIZE);

    let decompressed: Uint8Array;

    if (header.compressorId === COMPRESSOR_ID.BROTLI) {
        const brotli = await getBrotliIfAvailable();
        if (!brotli) {
            throw new CodecError(
                'This document requires Brotli decompression, but the WASM module is not available. Please reload the page.',
            );
        }
        try {
            decompressed = brotli.decompress(compressed);
        } catch {
            throw new CodecError('This share link appears to be corrupted and cannot be decompressed.');
        }
    } else {
        const deflate = getDeflateCompressor();
        try {
            decompressed = await deflate.decompress(compressed);
        } catch {
            throw new CodecError('This share link appears to be corrupted and cannot be decompressed.');
        }
    }

    // Guard runs post-decompression. Brotli WASM decompresses synchronously so
    // a malicious payload could spike memory before this check. In practice, URL
    // fragment size limits (~64KB encoded) cap the compressed input, bounding the
    // realistic decompression ratio.
    if (decompressed.byteLength > MAX_DECOMPRESSED_BYTES) {
        throw new CodecError('This document exceeds the maximum supported size (2 MB).');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(textDecoder.decode(decompressed));
    } catch {
        throw new CodecError('This share link contains corrupted data.');
    }

    const expanded = restoreDefaults(expandKeys(expandValues(parsed)));

    if (!isSerializedEditorState(expanded)) {
        throw new CodecError('This share link does not contain a valid document.');
    }

    return expanded;
};
