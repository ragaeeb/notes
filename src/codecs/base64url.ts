const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;
const CHUNK_SIZE = 0x8000;

const toBinaryString = (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, i + CHUNK_SIZE);
        binary += String.fromCharCode(...chunk);
    }
    return binary;
};

export const uint8ToBase64url = (bytes: Uint8Array): string => {
    if (bytes.length === 0) {
        return '';
    }

    return btoa(toBinaryString(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const base64urlToUint8 = (encoded: string): Uint8Array => {
    if (!BASE64URL_PATTERN.test(encoded)) {
        throw new Error('Invalid base64url input: contains non-url-safe characters');
    }

    if (encoded.length === 0) {
        return new Uint8Array();
    }

    const padded = encoded
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(encoded.length / 4) * 4, '=');

    let binary = '';
    try {
        binary = atob(padded);
    } catch {
        throw new Error('Invalid base64url input: decode failed');
    }

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};
