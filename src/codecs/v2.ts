import type { SerializedEditorState } from 'lexical';
import { decodeCm, encodeCm } from '../lib/cm-codec';
import { browserCompression, type CompressionRuntime } from '../lib/compression';
import { base64urlToUint8, uint8ToBase64url } from './base64url';
import { CodecError } from './types';
import {
    BROTLI_QUALITIES,
    CM_MAX_BYTES,
    CM_QUALIFIED,
    MAX_BYTES,
    MAX_FRAGMENT_CHARS,
    MODE_BY_TAG,
    MODES,
    type Mode,
    type Representation,
    SHARE_TARGET_MS,
} from './v2-constants';
import { asState, canonicalState, fail, hasLoneSurrogate, type Json, sameJson, strictUtf8, utf8 } from './v2-json';
import { isShippingCandidate, POLICY_ID } from './v2-policy';
import {
    type Body,
    decodeRepresentation,
    eligiblePlainText,
    plainState,
    representationBodies,
    v1Body,
} from './v2-representations';
import { decodeWindow8, encodeWindow8, literalDecode, literalEncode } from './v2-unicode';

export type CandidateResult = {
    representation: Representation | 'literal';
    tag: string;
    unicode: string;
    compression: string;
    quality: number | null;
    status: 'valid' | 'error' | 'skipped';
    representationBytes: number;
    compressedBytes: number | null;
    fragmentChars: number | null;
    urlChars: number | null;
    encodeMs: number;
    decodeMs: number;
    reason?: string;
};
export type EncodeReport = {
    policy: string;
    fragment: string;
    candidates: CandidateResult[];
    elapsedMs: number;
    budgetReached: boolean;
    v1Eligible: boolean;
    backend: string;
};
export type EncodeOptions = {
    search?: 'shipping' | 'exhaustive';
    runtime?: CompressionRuntime;
    budgetMs?: number;
    includeCm?: boolean;
    qualities?: readonly number[];
    onProgress?: (fragment: string) => void;
    onCandidate?: (candidate: CandidateResult) => void;
};
export type DecodeOptions = { runtime?: CompressionRuntime };
const primeKind = (representation: Representation): 'text' | 'structure' =>
    representation === 'text' || representation === 'markdown' ? 'text' : 'structure';
const wireUrl = (fragment: string): URL => new URL(`/v2/#${fragment}`, 'https://notes.ilmtest.io');
const serializedFragment = (fragment: string): string => wireUrl(fragment).hash.slice(1);
const asCodecError = (error: unknown): CodecError =>
    error instanceof CodecError
        ? error
        : new CodecError(
              error instanceof Error
                  ? `Unable to process share link: ${error.message}`
                  : 'Unable to process share link.',
          );
const strictBase64 = (text: string): Uint8Array => {
    if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
        return fail('Invalid base64url body.');
    }
    const bytes = base64urlToUint8(text);
    if (uint8ToBase64url(bytes) !== text) {
        return fail('Non-canonical base64url padding bits.');
    }
    return bytes;
};
export const decode = async (fragment: string, options: DecodeOptions = {}): Promise<SerializedEditorState> => {
    try {
        if (!fragment || fragment.length > MAX_FRAGMENT_CHARS) {
            return fail('The share link is empty or exceeds the supported size.');
        }
        if (fragment[0] === '.') {
            return asState(plainState(literalDecode(fragment)));
        }
        const mode = Object.hasOwn(MODE_BY_TAG, fragment[0]) ? MODE_BY_TAG[fragment[0]] : undefined;
        if (!mode) {
            return fail('This share link uses an unsupported v2 mode.');
        }
        const packed = strictBase64(fragment.slice(1));
        if (packed.length > MAX_BYTES + 65536) {
            return fail('The share link exceeds the supported size.');
        }
        const runtime = options.runtime ?? browserCompression;
        const bytes =
            mode.compression === 'raw'
                ? packed
                : mode.compression === 'cm'
                  ? decodeCm(packed, primeKind(mode.representation))
                  : await runtime.decompress(mode.compression, packed, MAX_BYTES);
        if (bytes.length > MAX_BYTES) {
            return fail('This document exceeds the maximum supported size (2 MB).');
        }
        const text = mode.unicode === 'utf8' ? strictUtf8.decode(bytes) : decodeWindow8(bytes);
        return asState(decodeRepresentation(mode.representation, text));
    } catch (error) {
        throw asCodecError(error);
    }
};
export const encodeWithReport = async (
    state: SerializedEditorState,
    options: EncodeOptions = {},
): Promise<EncodeReport> => {
    const started = performance.now();
    try {
        const input = canonicalState(state);
        const runtime = options.runtime ?? browserCompression;
        const limit = options.budgetMs ?? SHARE_TARGET_MS;
        if (!(limit > 0)) {
            return fail('Invalid compression time budget.');
        }
        const includeCm = options.includeCm ?? CM_QUALIFIED;
        const search = options.search ?? 'shipping';
        if (search !== 'shipping' && search !== 'exhaustive') {
            return fail('Invalid candidate search policy.');
        }
        const qualities = options.qualities ?? BROTLI_QUALITIES;
        if (qualities.some((q) => !Number.isInteger(q) || q < 1 || q > 11)) {
            return fail('Invalid Brotli quality.');
        }
        const candidates: CandidateResult[] = [];
        const seen = new Set<string>();
        let best: string | null = null;
        const publish = (fragment: string): void => {
            if (
                best === null ||
                fragment.length < best.length ||
                (fragment.length === best.length && fragment < best)
            ) {
                best = fragment;
                options.onProgress?.(best);
            }
        };
        const record = (result: CandidateResult): void => {
            candidates.push(result);
            options.onCandidate?.(result);
        };
        const v1 = v1Body(input);
        const fallback: Body =
            v1 === null ? { representation: 'json', text: JSON.stringify(input) } : { representation: 'v1', text: v1 };
        const brotli = await runtime.brotliAvailable();
        const tryCandidate = async (body: Body, mode: Mode, quality: number): Promise<void> => {
            const key = `${mode.tag}:${mode.compression === 'brotli' ? quality : 0}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            const result: CandidateResult = {
                compressedBytes: null,
                compression: mode.compression,
                decodeMs: 0,
                encodeMs: 0,
                fragmentChars: null,
                quality: mode.compression === 'brotli' ? quality : null,
                representation: body.representation,
                representationBytes: 0,
                status: 'error',
                tag: mode.tag,
                unicode: mode.unicode,
                urlChars: null,
            };
            const began = performance.now();
            try {
                if (hasLoneSurrogate(body.text)) {
                    return fail('Raw representation contains unpaired surrogates.');
                }
                const bytes = mode.unicode === 'utf8' ? utf8.encode(body.text) : encodeWindow8(body.text);
                result.representationBytes = bytes.length;
                if (bytes.length > MAX_BYTES) {
                    return fail('Representation exceeds the size limit.');
                }
                if (mode.compression === 'cm' && (!includeCm || bytes.length > CM_MAX_BYTES)) {
                    result.status = 'skipped';
                    result.reason = includeCm
                        ? 'CM representation exceeds 128 KiB.'
                        : 'CM emission is not release-qualified.';
                    return;
                }
                if (mode.compression === 'brotli' && !brotli) {
                    result.status = 'skipped';
                    result.reason = 'Brotli is unavailable.';
                    return;
                }
                const packed =
                    mode.compression === 'raw'
                        ? bytes
                        : mode.compression === 'cm'
                          ? encodeCm(bytes, primeKind(body.representation))
                          : await runtime.compress(mode.compression, bytes, quality);
                const fragment = serializedFragment(mode.tag + uint8ToBase64url(packed));
                result.compressedBytes = packed.length;
                result.encodeMs = performance.now() - began;
                const decoding = performance.now();
                const restored = await decode(fragment, { runtime });
                result.decodeMs = performance.now() - decoding;
                if (!sameJson(restored as unknown as Json, input)) {
                    return fail('Candidate failed exact document reconstruction.');
                }
                result.status = 'valid';
                result.fragmentChars = fragment.length;
                result.urlChars = wireUrl(fragment).href.length;
                publish(fragment);
            } catch (error) {
                result.reason = error instanceof Error ? error.message : String(error);
            } finally {
                if (!result.encodeMs) {
                    result.encodeMs = performance.now() - began;
                }
                record(result);
            }
        };
        const modeFor = (body: Body, compression: Mode['compression']): Mode => {
            const mode = MODES.find(
                (m) =>
                    m.representation === body.representation && m.unicode === 'utf8' && m.compression === compression,
            );
            if (!mode) {
                return fail();
            }
            return mode;
        };
        // Complete the v1-equivalent q11 baseline BEFORE publishing any other result.
        // If v1 itself is lossy on this input, use the verbatim full-JSON fallback.
        await tryCandidate(fallback, modeFor(fallback, brotli ? 'brotli' : 'deflate'), 11);
        if (best === null && brotli) {
            await tryCandidate(fallback, modeFor(fallback, 'deflate'), 0);
        }
        if (best === null) {
            await tryCandidate(fallback, modeFor(fallback, 'raw'), 0);
        }
        if (best === null) {
            return fail('No valid lossless share representation could be prepared.');
        }

        const text = eligiblePlainText(input);
        if (text !== null && performance.now() - started < limit) {
            const literalStarted = performance.now();
            const fragment = serializedFragment(literalEncode(text));
            const restored = await decode(fragment, { runtime });
            if (sameJson(restored as unknown as Json, input)) {
                record({
                    compressedBytes: null,
                    compression: 'raw',
                    decodeMs: 0,
                    encodeMs: performance.now() - literalStarted,
                    fragmentChars: fragment.length,
                    quality: null,
                    representation: 'literal',
                    representationBytes: utf8.encode(text).length,
                    status: 'valid',
                    tag: '.',
                    unicode: 'percent-escaped UTF-8',
                    urlChars: wireUrl(fragment).href.length,
                });
                publish(fragment);
            }
        }
        const order: readonly Representation[] = ['text', 'markdown', 'tuples', 'compact', 'split', 'v1', 'json'];
        const bodies = [...representationBodies(input)].sort(
            (a, b) => order.indexOf(a.representation) - order.indexOf(b.representation),
        );
        const bodyKeys = new Set<string>();
        const admitted: Body[] = [];
        for (const body of bodies) {
            try {
                if (!sameJson(decodeRepresentation(body.representation, body.text), input)) {
                    continue;
                }
            } catch {
                continue;
            }
            const bodyKey = `${primeKind(body.representation)}:${body.text}`;
            if (bodyKeys.has(bodyKey)) {
                continue;
            }
            bodyKeys.add(bodyKey);
            admitted.push(body);
        }
        // Shipping completes ordinary candidates first, so a slow CM attempt cannot
        // hide a much smaller Unicode-window/split-text ordinary fallback.
        const phases: readonly (boolean | null)[] = search === 'shipping' ? [false, true] : [null];
        outer: for (const cmPhase of phases) {
            for (const body of admitted) {
                for (const mode of MODES.filter((m) => m.representation === body.representation)) {
                    if (cmPhase !== null && (mode.compression === 'cm') !== cmPhase) {
                        continue;
                    }
                    for (const quality of mode.compression === 'brotli' ? qualities : [0]) {
                        if (performance.now() - started >= limit) {
                            break outer;
                        }
                        if (search === 'shipping' && !isShippingCandidate(mode, quality, text !== null)) {
                            continue;
                        }
                        await tryCandidate(body, mode, quality);
                    }
                }
            }
        }
        return {
            backend: runtime.name,
            budgetReached: performance.now() - started >= limit,
            candidates,
            elapsedMs: performance.now() - started,
            fragment: best,
            policy: search === 'shipping' ? POLICY_ID : 'exhaustive-qualities-4-6-9-10-11',
            v1Eligible: v1 !== null,
        };
    } catch (error) {
        throw asCodecError(error);
    }
};
export const encode = async (state: SerializedEditorState, options: EncodeOptions = {}): Promise<string> =>
    (await encodeWithReport(state, options)).fragment;
