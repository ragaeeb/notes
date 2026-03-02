import { beforeEach, describe, expect, it, mock } from 'bun:test';

const createPassthroughCompressionGlobals = () => {
    class PassThroughCompressionStream {
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;

        constructor() {
            const stream = new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                    controller.enqueue(chunk);
                },
            });

            this.readable = stream.readable;
            this.writable = stream.writable;
        }
    }

    class PassThroughDecompressionStream {
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;

        constructor() {
            const stream = new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                    controller.enqueue(chunk);
                },
            });

            this.readable = stream.readable;
            this.writable = stream.writable;
        }
    }

    (globalThis as unknown as { CompressionStream: unknown }).CompressionStream = PassThroughCompressionStream;
    (globalThis as unknown as { DecompressionStream: unknown }).DecompressionStream = PassThroughDecompressionStream;
};

beforeEach(() => {
    mock.restore();
});

describe('getCompressor', () => {
    it('should return a Brotli compressor when WASM loads successfully', async () => {
        mock.module('brotli-wasm', () => ({
            default: Promise.resolve({
                compress: (input: Uint8Array) => input,
                decompress: (input: Uint8Array) => input,
            }),
        }));

        const { getCompressor } = await import(`./compression?case=${Math.random()}`);
        const compressor = await getCompressor();

        expect(compressor.codec).toBe('brotli');
    });

    it('should return a cached Brotli module on subsequent calls', async () => {
        const compressMock = mock((input: Uint8Array) => input);
        mock.module('brotli-wasm', () => ({
            default: Promise.resolve({ compress: compressMock, decompress: (input: Uint8Array) => input }),
        }));

        const { getCompressor } = await import(`./compression?case=${Math.random()}`);
        const first = await getCompressor();
        const second = await getCompressor();
        await first.compress(new Uint8Array([1, 2, 3]));
        await second.compress(new Uint8Array([4, 5, 6]));

        expect(compressMock).toHaveBeenCalledTimes(2);
    });

    it('should compress and decompress data correctly with Brotli', async () => {
        mock.module('brotli-wasm', () => ({
            default: Promise.resolve({
                compress: (input: Uint8Array) => new Uint8Array([...input].reverse()),
                decompress: (input: Uint8Array) => new Uint8Array([...input].reverse()),
            }),
        }));

        const { getCompressor } = await import(`./compression?case=${Math.random()}`);
        const compressor = await getCompressor();
        const input = new TextEncoder().encode('brotli works');
        const compressed = await compressor.compress(input);
        const decompressed = await compressor.decompress(compressed);

        expect(new TextDecoder().decode(decompressed)).toBe('brotli works');
    });

    it('should expose a working native deflate compressor', async () => {
        createPassthroughCompressionGlobals();
        const { getDeflateCompressor } = await import(`./compression?case=${Math.random()}`);
        const compressor = getDeflateCompressor();

        expect(compressor.codec).toBe('deflate');
        expect(typeof compressor.compress).toBe('function');
        expect(typeof compressor.decompress).toBe('function');
    });
});

describe('getBrotliIfAvailable', () => {
    it('should return the module when WASM loads successfully', async () => {
        const fakeModule = {
            compress: (input: Uint8Array) => input,
            decompress: (input: Uint8Array) => input,
        };
        mock.module('brotli-wasm', () => ({
            default: Promise.resolve(fakeModule),
        }));

        const { getBrotliIfAvailable } = await import(`./compression?case=${Math.random()}`);
        const result = await getBrotliIfAvailable();

        expect(result).not.toBeNull();
        expect(typeof result?.compress).toBe('function');
        expect(typeof result?.decompress).toBe('function');
    });

    it('should return null when WASM fails to load', async () => {
        mock.module('brotli-wasm', () => ({
            default: Promise.resolve(null),
        }));

        const { getBrotliIfAvailable } = await import(`./compression?case=${Math.random()}`);
        const result = await getBrotliIfAvailable();

        expect(result).toBeNull();
    });

    it('should pass quality option through to Brotli compress', async () => {
        let capturedOptions: { quality?: number } | undefined;
        mock.module('brotli-wasm', () => ({
            default: Promise.resolve({
                compress: (input: Uint8Array, opts?: { quality?: number }) => {
                    capturedOptions = opts;
                    return input;
                },
                decompress: (input: Uint8Array) => input,
            }),
        }));

        const { getBrotliCompressor } = await import(`./compression?case=${Math.random()}`);
        const compressor = await getBrotliCompressor();
        await compressor.compress(new Uint8Array([1, 2, 3]));

        expect(capturedOptions?.quality).toBe(11);
    });
});
