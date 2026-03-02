import { BROTLI_QUALITY } from '../codecs/v1-constants';

export type Compressor = {
    codec: 'brotli' | 'deflate';
    compress: (input: Uint8Array) => Promise<Uint8Array>;
    decompress: (input: Uint8Array) => Promise<Uint8Array>;
};

type BrotliModule = {
    compress: (input: Uint8Array, options?: { quality?: number }) => Uint8Array;
    decompress: (input: Uint8Array) => Uint8Array;
};

let brotliModule: BrotliModule | null = null;
let brotliPromise: Promise<BrotliModule | null> | null = null;

const readAllChunks = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
            break;
        }

        chunks.push(chunk.value);
        totalLength += chunk.value.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
};

const streamCompression = async (algorithm: 'deflate-raw' | 'gzip', input: Uint8Array): Promise<Uint8Array> => {
    if (typeof CompressionStream === 'undefined') {
        throw new Error('CompressionStream is not available in this environment');
    }

    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream(algorithm));
    return readAllChunks(stream as ReadableStream<Uint8Array>);
};

const streamDecompression = async (algorithm: 'deflate-raw' | 'gzip', input: Uint8Array): Promise<Uint8Array> => {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream is not available in this environment');
    }

    const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream(algorithm));
    return readAllChunks(stream as ReadableStream<Uint8Array>);
};

const makeBrotliCompressor = (module: BrotliModule): Compressor => ({
    codec: 'brotli',
    compress: async (input) => module.compress(input, { quality: BROTLI_QUALITY }),
    decompress: async (input) => module.decompress(input),
});

const makeNativeDeflateCompressor = (): Compressor => ({
    codec: 'deflate',
    compress: async (input) => streamCompression('deflate-raw', input),
    decompress: async (input) => streamDecompression('deflate-raw', input),
});

const loadBrotliModule = async (): Promise<BrotliModule> => {
    const module = await import('brotli-wasm');
    return (await module.default) as BrotliModule;
};

const initBrotli = (): Promise<BrotliModule | null> => {
    if (!brotliPromise) {
        brotliPromise = loadBrotliModule()
            .then((m) => {
                brotliModule = m;
                return m;
            })
            .catch(() => null);
    }
    return brotliPromise;
};

export const getBrotliIfAvailable = async (): Promise<BrotliModule | null> => {
    if (brotliModule) {
        return brotliModule;
    }
    return initBrotli();
};

export const getBrotliCompressor = async (): Promise<Compressor> => {
    const m = await getBrotliIfAvailable();
    if (!m) {
        throw new Error('Brotli WASM failed to load');
    }
    return makeBrotliCompressor(m);
};

export const getDeflateCompressor = (): Compressor => makeNativeDeflateCompressor();

export const getCompressor = async (): Promise<Compressor> => {
    try {
        return await getBrotliCompressor();
    } catch {
        return getDeflateCompressor();
    }
};
