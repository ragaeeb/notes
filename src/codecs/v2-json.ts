import type { SerializedEditorState } from 'lexical';
import { CodecError } from './types';
import { MAX_BYTES, MAX_CONTAINERS, MAX_DEPTH } from './v2-constants';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Obj = { [key: string]: Json };
export const utf8 = new TextEncoder();
export const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export const isObject = (value: unknown): value is Obj =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
export const fail = (message = 'This share link contains invalid document data.'): never => {
    throw new CodecError(message);
};
export const asObject = (value: Json): Obj => (isObject(value) ? value : fail());
export const asArray = (value: Json): Json[] => (Array.isArray(value) ? value : fail());
export const jsonBytes = (value: Json): number => utf8.encode(JSON.stringify(value)).length;
export const sameJson = (a: Json, b: Json): boolean => {
    if (a === b) {
        return true;
    }
    if (Array.isArray(a)) {
        return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
    }
    if (!isObject(a) || !isObject(b)) {
        return false;
    }
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
};

// Counts serialized UTF-8 bytes BEFORE adding each reconstructed value. Children already
// charged to this budget are never charged twice. No post-allocation-only bomb guard.
export class JsonBudget {
    private bytes = 0;
    private containers = 0;
    private add(n: number): void {
        this.bytes += n;
        if (this.bytes > MAX_BYTES) {
            fail('This document exceeds the maximum supported size (2 MB).');
        }
    }
    private enter(depth: number): void {
        if (depth > MAX_DEPTH || ++this.containers > MAX_CONTAINERS) {
            fail('This document is too deeply nested or has too many nodes.');
        }
    }
    object(fields: Obj, accounted: readonly string[] = [], depth = 0): Obj {
        this.enter(depth);
        const keys = Object.keys(fields);
        this.add(2 + Math.max(0, keys.length - 1));
        const entries: [string, Json][] = [];
        for (const key of keys) {
            this.add(jsonBytes(key) + 1);
            entries.push([key, accounted.includes(key) ? fields[key] : this.copy(fields[key], depth + 1)]);
        }
        // Object.fromEntries creates own data properties even for '__proto__'.
        return Object.fromEntries(entries);
    }
    array(values: Json[], accounted = false, depth = 0): Json[] {
        this.enter(depth);
        this.add(2 + Math.max(0, values.length - 1));
        return accounted ? values : values.map((v) => this.copy(v, depth + 1));
    }
    copy(value: Json, depth = 0): Json {
        if (depth > MAX_DEPTH) {
            fail('This document is too deeply nested.');
        }
        if (Array.isArray(value)) {
            return this.array(value, false, depth);
        }
        if (isObject(value)) {
            return this.object(value, [], depth);
        }
        if (typeof value === 'number' && !Number.isFinite(value)) {
            fail();
        }
        if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
            fail();
        }
        if (typeof value === 'string' && value.length > MAX_BYTES) {
            fail('This document exceeds the maximum supported size (2 MB).');
        }
        this.add(jsonBytes(value));
        return value;
    }
}
export const parseJson = (text: string): Json => {
    if (utf8.encode(text).length > MAX_BYTES) {
        fail('This document exceeds the maximum supported size (2 MB).');
    }
    return new JsonBudget().copy(JSON.parse(text) as Json);
};
export const asState = (value: Json): SerializedEditorState => {
    if (!isObject(value) || !isObject(value.root)) {
        fail('This share link does not contain a valid document.');
    }
    return value as unknown as SerializedEditorState;
};
export const canonicalState = (state: SerializedEditorState): Obj => {
    try {
        const value = parseJson(JSON.stringify(state));
        asState(value);
        return asObject(value);
    } catch (error) {
        if (error instanceof CodecError) {
            throw error;
        }
        return fail('Cannot share: invalid editor state.');
    }
};
export const hasLoneSurrogate = (value: string): boolean => {
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
            const next = value.charCodeAt(++i);
            if (!(next >= 0xdc00 && next <= 0xdfff)) {
                return true;
            }
        } else if (c >= 0xdc00 && c <= 0xdfff) {
            return true;
        }
    }
    return false;
};
