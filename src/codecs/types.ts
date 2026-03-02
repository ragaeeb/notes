import type { SerializedEditorState } from 'lexical';

export type DocumentPayload = { v: 1; content: SerializedEditorState; title?: string; codec?: 'brotli' | 'deflate' };

export type CodecVersion = 'v1';

export type DetectVersionResult = CodecVersion | 'unknown';

export type CompressorId = 0x00 | 0x01;

export type PayloadHeader = {
    compressorId: CompressorId;
    formatVersion: number;
    reprFlags: number;
};

export class CodecError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CodecError';
    }
}
