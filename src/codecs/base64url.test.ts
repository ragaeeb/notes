import { describe, expect, it } from 'bun:test';

import { base64urlToUint8, uint8ToBase64url } from './base64url';

describe('base64url', () => {
    it('should round-trip encode and decode correctly', () => {
        const input = new TextEncoder().encode('Hello, world!');
        const encoded = uint8ToBase64url(input);
        const decoded = base64urlToUint8(encoded);

        expect(Array.from(decoded)).toEqual(Array.from(input));
    });

    it('should produce no padding characters (=) in output', () => {
        const input = new TextEncoder().encode('abc123');
        const encoded = uint8ToBase64url(input);

        expect(encoded.includes('=')).toBe(false);
    });

    it('should use only URL-safe characters (A-Za-z0-9-_)', () => {
        const input = new Uint8Array(Array.from({ length: 255 }, (_, index) => index));
        const encoded = uint8ToBase64url(input);

        expect(/^[A-Za-z0-9_-]+$/.test(encoded)).toBe(true);
    });

    it('should handle empty Uint8Array input', () => {
        const encoded = uint8ToBase64url(new Uint8Array());
        const decoded = base64urlToUint8(encoded);

        expect(encoded).toBe('');
        expect(decoded.length).toBe(0);
    });

    it('should handle single-byte input', () => {
        const input = new Uint8Array([255]);
        const encoded = uint8ToBase64url(input);
        const decoded = base64urlToUint8(encoded);

        expect(decoded[0]).toBe(255);
    });

    it('should handle large inputs without truncation', () => {
        const input = new Uint8Array(10000).map((_, index) => index % 251);
        const encoded = uint8ToBase64url(input);
        const decoded = base64urlToUint8(encoded);

        expect(decoded.length).toBe(input.length);
        expect(decoded[9999]).toBe(input[9999]);
    });

    it('should throw on malformed input', () => {
        expect(() => base64urlToUint8('abc$%')).toThrow();
    });
});
