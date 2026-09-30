import { MAX_BYTES } from './v2-constants';
import { fail, hasLoneSurrogate, strictUtf8, utf8 } from './v2-json';

// Frozen window8: two-byte BE index selects 128 scalar values. ASCII 0..126 is
// literal, 0x7f escapes one UTF-8 scalar (length byte + bytes), 0x80..ff is the window.
// Index 0..0x21ff covers Unicode; surrogate windows 0x1b0..0x1bf are invalid.
export const encodeWindow8 = (text: string): Uint8Array => {
    if (hasLoneSurrogate(text)) {
        fail('Raw text cannot contain unpaired surrogates.');
    }
    const counts = new Map<number, number>();
    for (const char of text) {
        const cp = char.codePointAt(0) ?? 0;
        if (cp >= 128) {
            const window = cp >>> 7;
            counts.set(window, (counts.get(window) ?? 0) + utf8.encode(char).length - 1);
        }
    }
    let index = 0;
    let best = 0;
    for (const [window, saved] of counts) {
        if (saved > best || (saved === best && window < index)) {
            index = window;
            best = saved;
        }
    }
    const bytes = [index >>> 8, index & 255];
    for (const char of text) {
        const cp = char.codePointAt(0) ?? 0;
        if (cp < 127) {
            bytes.push(cp);
        } else if (cp >>> 7 === index) {
            bytes.push(128 | (cp & 127));
        } else {
            const encoded = utf8.encode(char);
            bytes.push(127, encoded.length, ...encoded);
        }
        if (bytes.length > MAX_BYTES) {
            fail('Unicode representation exceeds the size limit.');
        }
    }
    return new Uint8Array(bytes);
};
export const decodeWindow8 = (bytes: Uint8Array): string => {
    if (bytes.length < 2 || bytes.length > MAX_BYTES) {
        fail('Invalid Unicode window.');
    }
    const index = bytes[0] * 256 + bytes[1];
    if (index > 0x21ff || (index >= 0x1b0 && index <= 0x1bf)) {
        fail('Invalid Unicode window.');
    }
    const parts: string[] = [];
    let size = 0;
    for (let i = 2; i < bytes.length; i++) {
        const byte = bytes[i];
        let char: string;
        if (byte < 127) {
            char = String.fromCharCode(byte);
        } else if (byte >= 128) {
            char = String.fromCodePoint((index << 7) | (byte & 127));
        } else {
            const length = bytes[++i];
            if (!Number.isInteger(length) || length < 1 || length > 4 || i + length >= bytes.length) {
                fail('Invalid Unicode escape.');
            }
            char = strictUtf8.decode(bytes.subarray(i + 1, i + length + 1));
            if ([...char].length !== 1 || hasLoneSurrogate(char)) {
                fail('Invalid Unicode scalar.');
            }
            i += length;
        }
        size += utf8.encode(char).length;
        if (size > MAX_BYTES) {
            fail('Unicode reconstruction exceeds the size limit.');
        }
        parts.push(char);
    }
    return parts.join('');
};
export const literalEncode = (text: string): string => {
    if (hasLoneSurrogate(text)) {
        fail();
    }
    return `.${encodeURIComponent(text)
        .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/%20/g, '~')}`;
};
export const literalDecode = (fragment: string): string => {
    const body = fragment.slice(1);
    if (!/^(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2})*$/.test(body)) {
        fail('Invalid literal text escape.');
    }
    return decodeURIComponent(body.replace(/~/g, '%20'));
};
