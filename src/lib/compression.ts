import { BROTLI_QUALITY, MAX_DECOMPRESSED_BYTES } from '../codecs/v1-constants';
import { validateDeflateFraming } from './deflate-framing';

export type Compressor = {
    codec: 'brotli' | 'deflate';
    compress: (input: Uint8Array) => Promise<Uint8Array>;
    decompress: (input: Uint8Array) => Promise<Uint8Array>;
};
type BrotliStream = {
    decompress: (input: Uint8Array, outputSize: number) => { buf: Uint8Array; code: number; input_offset: number };
    free: () => void;
};
export type BrotliModule = {
    compress: (input: Uint8Array, options?: { quality?: number }) => Uint8Array;
    decompress: (input: Uint8Array) => Uint8Array;
    DecompressStream?: new () => BrotliStream;
    BrotliStreamResultCode?: { ResultSuccess: number; NeedsMoreInput: number; NeedsMoreOutput: number };
};
const CHUNK_BYTES = 64 * 1024;
let brotliModule: BrotliModule | null = null;
let brotliPromise: Promise<BrotliModule | null> | null = null;

export const readBoundedChunks = async (
    stream: ReadableStream<Uint8Array>,
    maxBytes = MAX_DECOMPRESSED_BYTES,
): Promise<Uint8Array> => {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    let done = false;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) {
                done = true;
                break;
            }
            length += next.value.length;
            if (length > maxBytes) {
                throw new Error('Decompressed content exceeds the size limit.');
            }
            chunks.push(next.value);
        }
        const result = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    } finally {
        if (!done) {
            try {
                await reader.cancel();
            } catch {
                /* Preserve the original stream error. */
            }
        }
        reader.releaseLock();
    }
};
const streamCompression = async (input: Uint8Array): Promise<Uint8Array> => {
    if (typeof CompressionStream === 'undefined') {
        throw new Error('CompressionStream is not available.');
    }
    // Own the backing ArrayBuffer: Uint8Array<ArrayBufferLike> is not a BlobPart.
    const stream = new Blob([new Uint8Array(input).buffer]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return readBoundedChunks(stream, MAX_DECOMPRESSED_BYTES + CHUNK_BYTES);
};
const streamDecompression = async (input: Uint8Array, limit = MAX_DECOMPRESSED_BYTES): Promise<Uint8Array> => {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream is not available.');
    }
    const expectedLength = validateDeflateFraming(input, limit);
    const stream = new Blob([new Uint8Array(input).buffer])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
    const result = await readBoundedChunks(stream, limit);
    if (result.length !== expectedLength) {
        throw new Error('Invalid deflate output length.');
    }
    return result;
};

// Synchronous facade retains the frozen v1 decoder API, while both v1 and v2 get
// incremental, bounded Brotli output. Never fall back to an unbounded one-shot decoder.
export const decompressBrotliBounded = (
    module: BrotliModule,
    input: Uint8Array,
    limit = MAX_DECOMPRESSED_BYTES,
): Uint8Array => {
    const codes = module.BrotliStreamResultCode;
    if (!module.DecompressStream || !codes) {
        throw new Error('Bounded Brotli stream decoding is unavailable.');
    }
    const stream = new module.DecompressStream();
    const chunks: Uint8Array[] = [];
    let length = 0;
    let offset = 0;
    try {
        while (true) {
            const chunk = input.subarray(offset, Math.min(input.length, offset + CHUNK_BYTES));
            const result = stream.decompress(chunk, Math.min(CHUNK_BYTES, limit - length + 1));
            if (
                !Number.isInteger(result.input_offset) ||
                result.input_offset < 0 ||
                result.input_offset > chunk.length
            ) {
                throw new Error('Invalid Brotli input offset.');
            }
            offset += result.input_offset;
            length += result.buf.length;
            if (length > limit) {
                throw new Error('Decompressed content exceeds the size limit.');
            }
            chunks.push(result.buf.slice());
            if (result.code === codes.ResultSuccess) {
                if (offset !== input.length) {
                    throw new Error('Unexpected trailing Brotli input.');
                }
                break;
            }
            if (result.code !== codes.NeedsMoreInput && result.code !== codes.NeedsMoreOutput) {
                throw new Error('Invalid Brotli stream.');
            }
            if (result.code === codes.NeedsMoreInput && offset === input.length) {
                throw new Error('Truncated Brotli stream.');
            }
            if (!result.input_offset && !result.buf.length) {
                throw new Error('Brotli stream made no progress.');
            }
        }
        const output = new Uint8Array(length);
        let written = 0;
        for (const chunk of chunks) {
            output.set(chunk, written);
            written += chunk.length;
        }
        return output;
    } finally {
        stream.free();
    }
};
const loadBrotliModule = async (): Promise<BrotliModule> => {
    const imported = await import('brotli-wasm');
    const module = (await imported.default) as BrotliModule;
    if (!module) {
        throw new Error('Brotli WASM did not initialize.');
    }
    return {
        ...module,
        compress: (input, options) => module.compress(input, options),
        decompress: (input) => decompressBrotliBounded(module, input),
    };
};
const initBrotli = (): Promise<BrotliModule | null> => {
    if (!brotliPromise) {
        brotliPromise = loadBrotliModule()
            .then((module) => {
                brotliModule = module;
                return module;
            })
            .catch((error) => {
                console.warn('Brotli WASM initialization failed:', error);
                // A fresh worker retries on the next request; avoid repeated imports per candidate.
                return null;
            });
    }
    return brotliPromise;
};
export const getBrotliIfAvailable = async (): Promise<BrotliModule | null> => brotliModule ?? initBrotli();
export const getBrotliCompressor = async (): Promise<Compressor> => {
    const module = await getBrotliIfAvailable();
    if (!module) {
        throw new Error('Brotli WASM failed to load.');
    }
    return {
        codec: 'brotli',
        compress: async (input) => module.compress(input, { quality: BROTLI_QUALITY }),
        decompress: async (input) => module.decompress(input),
    };
};
export const getDeflateCompressor = (): Compressor => ({
    codec: 'deflate',
    compress: streamCompression,
    decompress: streamDecompression,
});
export const getCompressor = async (): Promise<Compressor> => {
    try {
        return await getBrotliCompressor();
    } catch {
        return getDeflateCompressor();
    }
};

// Explicit portability seam for offline measurements. Browser callers use this default;
// Node-native measurements must provide AND report their different backend.
export type CompressionRuntime = {
    name: string;
    brotliAvailable: () => Promise<boolean>;
    compress: (kind: 'brotli' | 'deflate', input: Uint8Array, quality: number) => Promise<Uint8Array>;
    decompress: (kind: 'brotli' | 'deflate', input: Uint8Array, maxBytes: number) => Promise<Uint8Array>;
};
export const browserCompression: CompressionRuntime = {
    brotliAvailable: async () => (await getBrotliIfAvailable()) !== null,
    compress: async (kind, input, quality) => {
        if (kind === 'deflate') {
            return streamCompression(input);
        }
        const module = await getBrotliIfAvailable();
        if (!module) {
            throw new Error('Brotli WASM is unavailable.');
        }
        return module.compress(input, { quality });
    },
    decompress: async (kind, input, maxBytes) => {
        if (kind === 'deflate') {
            return streamDecompression(input, maxBytes);
        }
        const module = await getBrotliIfAvailable();
        if (!module) {
            throw new Error('Brotli WASM is unavailable.');
        }
        return decompressBrotliBounded(module, input, maxBytes);
    },
    name: 'brotli-wasm + CompressionStream',
};
