// Real Node/Bun zlib algorithms, NOT brotli-wasm. Never imported by browser production code.
import { brotliCompressSync, constants, createBrotliDecompress } from 'node:zlib';
import { Readable } from 'node:stream';
import { browserCompression, readBoundedChunks, type CompressionRuntime } from '../../src/lib/compression';
export const nativeCompression: CompressionRuntime = {
    name: `Node zlib Brotli ${process.versions.brotli ?? 'unknown'} + native CompressionStream`,
    brotliAvailable: async () => true,
    compress: async (kind, data, quality) => kind === 'brotli'
        ? new Uint8Array(brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }))
        : browserCompression.compress(kind, data, quality),
    decompress: async (kind, data, maxBytes) => {
        if (kind === 'deflate') return browserCompression.decompress(kind, data, maxBytes);
        const stream = createBrotliDecompress({ chunkSize: 16 * 1024 });
        stream.end(data);
        try {
            const result = await readBoundedChunks(Readable.toWeb(stream) as ReadableStream<Uint8Array>, maxBytes);
            if (stream.bytesWritten !== data.length) throw new Error('Unexpected trailing Brotli bytes.');
            return result;
        } finally { stream.destroy(); }
    },
};
