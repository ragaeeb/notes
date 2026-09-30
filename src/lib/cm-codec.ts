import { CodecError } from '../codecs/types';
import { CM_MAX_BYTES, CM_MAX_MODEL_BYTES, MAX_BYTES } from '../codecs/v2-constants';
import { cmPrime } from './cm-v2-corpus';

// Frozen v2 integer CM model, derived from scripts/cm-codec.ts.
// The v2 frame and memory contract below intentionally differ from the research codec.
//
// Every model computation uses integers below 2^53, so the output is bit-identical across
// JavaScript engines in tested environments; see qualification evidence. The model is first trained on a frozen priming corpus, then keeps
// adapting while it codes the document. Encoder and decoder run the same model.

export type CmParams = {
    /** Mixer learning rate (error multiplier). */
    mixerRate: number;
    /** Adaptation limit for the bit-history to probability maps. */
    stateLimit: number;
    /** Adaptation limit for the match-model map. */
    matchLimit: number;
    /** Shift for the APM update rate. */
    apmRate: number;
    /** Minimum match length for the match model. */
    matchMin: number;
    /** Weight, out of 4, of the APM-refined prediction in the final probability. */
    apmWeight: number;
    /** Scale of the run-confidence inputs; 0 disables them. */
    confidence: number;
    /** Adaptation limit for the stationary order-0 and order-1 counters. */
    directLimit: number;
    /** Learning rate of the final mixer. */
    finalRate: number;
    /** Shift for the moving average of recent coding cost. */
    regimeRate: number;
};

export const DEFAULT_PARAMS: Readonly<CmParams> = Object.freeze({
    apmRate: 6,
    apmWeight: 2,
    confidence: 96,
    directLimit: 1023,
    finalRate: 6,
    matchLimit: 255,
    matchMin: 4,
    mixerRate: 32,
    regimeRate: 5,
    stateLimit: 255,
});

const SQUASH_TABLE = [
    1, 2, 3, 6, 10, 16, 27, 45, 73, 120, 194, 310, 488, 747, 1101, 1546, 2047, 2549, 2994, 3348, 3607, 3785, 3901, 3975,
    4022, 4050, 4068, 4079, 4085, 4089, 4092, 4093, 4094,
];

// Returns 4096 / (1 + e^(-d / 256)) for d in -2047..2047, by table interpolation.
const squash = (d: number): number => {
    if (d > 2047) {
        return 4095;
    }
    if (d < -2047) {
        return 0;
    }
    const w = d & 127;
    const i = (d >> 7) + 16;
    return (SQUASH_TABLE[i] * (128 - w) + SQUASH_TABLE[i + 1] * w + 64) >> 7;
};

// Inverse of squash, built by inverting the table so no floating-point math is involved.
const STRETCH = (() => {
    const table = new Int16Array(4096);
    let next = 0;
    for (let x = -2047; x <= 2047; x += 1) {
        const v = squash(x);
        for (let i = next; i <= v; i += 1) {
            table[i] = x;
        }
        next = v + 1;
    }
    for (let i = next; i < 4096; i += 1) {
        table[i] = 2047;
    }
    return table;
})();

// RATE[n] = 65536 / (n + 1.5)
const RATE = (() => {
    const table = new Int32Array(1024);
    for (let n = 0; n < 1024; n += 1) {
        table[n] = Math.floor(131072 / (2 * n + 3));
    }
    return table;
})();

const HASHED_CONTEXTS = 7;
const DIRECT_CONTEXTS = 2;
const CONTEXTS = HASHED_CONTEXTS + DIRECT_CONTEXTS;
const INPUTS = CONTEXTS * 2 + 4;
const STATES = 512;
const REGIMES = 6;
const MIXER_SETS = [256, 256, 25 * REGIMES] as const;
const MATCH_HASH_BITS = 18;
const MAX_MATCH = 47;

const nextState = (state: number, y: number): number => {
    let n0 = state & 15;
    let n1 = (state >> 4) & 15;
    if (y) {
        n1 = n1 < 15 ? n1 + 1 : 15;
        if (n0 > 2) {
            n0 = (n0 >> 1) + 1;
        }
    } else {
        n0 = n0 < 15 ? n0 + 1 : 15;
        if (n1 > 2) {
            n1 = (n1 >> 1) + 1;
        }
    }
    return n0 | (n1 << 4) | (y << 8);
};

const NEXT_STATE = (() => {
    const table = new Uint16Array(STATES * 2);
    for (let s = 0; s < STATES; s += 1) {
        table[s * 2] = nextState(s, 0);
        table[s * 2 + 1] = nextState(s, 1);
    }
    return table;
})();

// Confidence of a bit history: grows with the number of observations.
const CONFIDENCE = (() => {
    const table = new Int16Array(STATES);
    for (let s = 0; s < STATES; s += 1) {
        const n0 = s & 15;
        const n1 = (s >> 4) & 15;
        if (n0 === 0 && n1 > 0) {
            table[s] = n1;
        } else if (n1 === 0 && n0 > 0) {
            table[s] = -n0;
        }
    }
    return table;
})();

const isWordByte = (c: number) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c >= 128 || c === 39;

export const tableBitsFor = (totalBytes: number): number => {
    let bits = 16;
    while (bits < 18 && 1 << bits < totalBytes * 16) {
        bits += 1;
    }
    return bits;
};

class Model {
    private readonly params: CmParams;
    private readonly buf: Uint8Array;
    private pos = 0;
    private c0 = 1;
    private c4 = 0;
    private bitPos = 0;
    private wordHash = 0;
    private prevWordHash = 0;
    private lineStart = 0;

    private readonly tableBits: number;
    private readonly hashes = new Uint32Array(HASHED_CONTEXTS);
    private readonly slots: Uint16Array;
    private readonly checks: Uint8Array;
    private readonly direct0 = new Uint16Array(256);
    private readonly direct1 = new Uint16Array(65536);
    private readonly counter0 = new Uint16Array(256).fill(32768);
    private readonly counter1 = new Uint16Array(65536).fill(32768);
    private readonly counterN0 = new Uint16Array(256);
    private readonly counterN1 = new Uint16Array(65536);
    private readonly slotIndex = new Int32Array(CONTEXTS);
    private readonly states = new Uint16Array(CONTEXTS);

    private readonly stateProb = new Uint16Array(CONTEXTS * STATES);
    private readonly stateCount = new Uint16Array(CONTEXTS * STATES);

    private readonly matchTable = new Int32Array(1 << MATCH_HASH_BITS);
    private matchPtr = 0;
    private matchLen = 0;
    private matchBit = -1;
    private matchIndex = 0;
    private readonly matchProb = new Uint16Array((MAX_MATCH + 1) * 2);
    private readonly matchCount = new Uint16Array((MAX_MATCH + 1) * 2);

    private readonly inputs = new Int32Array(INPUTS);
    private readonly weights: Int32Array[];
    private readonly mixerSelected = new Int32Array(MIXER_SETS.length);
    private readonly mixerOut = new Int32Array(MIXER_SETS.length);
    private readonly finalWeights = new Int32Array(MIXER_SETS.length * 8 * REGIMES);
    private errorAverage = 0;
    private regime = 0;
    private mixed = 2048;

    private readonly apm0 = new Uint16Array(256 * 33);
    private readonly apm1 = new Uint16Array(65536 * 33);
    private apm0Index = 0;
    private apm1Index = 0;
    private apmWeightLow = 0;

    /** Probability that the next bit is 1, in 1..4095. */
    p = 2048;

    constructor(capacity: number, params: CmParams) {
        this.params = params;
        this.buf = new Uint8Array(capacity + 1);
        this.tableBits = tableBitsFor(capacity);
        this.slots = new Uint16Array(HASHED_CONTEXTS << this.tableBits);
        this.checks = new Uint8Array(HASHED_CONTEXTS << this.tableBits);
        for (let c = 0; c < CONTEXTS; c += 1) {
            for (let s = 0; s < STATES; s += 1) {
                const n0 = s & 15;
                const n1 = (s >> 4) & 15;
                this.stateProb[c * STATES + s] = Math.floor(((n1 * 2 + 1) * 65536) / (n0 * 2 + n1 * 2 + 2));
            }
        }
        for (let len = 0; len <= MAX_MATCH; len += 1) {
            const strength = Math.min(60000, 36000 + len * 1200);
            this.matchProb[len * 2] = 65536 - strength;
            this.matchProb[len * 2 + 1] = strength;
        }
        this.weights = MIXER_SETS.map((sets) => new Int32Array(sets * INPUTS).fill(Math.floor(65536 * 0.18)));
        this.finalWeights.fill(Math.floor(65536 / MIXER_SETS.length));
        for (const apm of [this.apm0, this.apm1]) {
            for (let i = 0; i < apm.length; i += 1) {
                apm[i] = squash(((i % 33) - 16) * 128) * 16;
            }
        }
        this.setByteContexts();
        this.predict();
    }

    private setByteContexts() {
        const c4 = this.c4;
        const c1 = c4 & 0xff;
        const h = this.hashes;
        h[0] = Math.imul((c4 & 0xffff) + 0x10000, 0x2f0b4a87);
        h[1] = Math.imul((c4 & 0xffffff) + 0x3000000, 0x5bd1e995);
        h[2] = Math.imul(c4, 0x1b873593) ^ 0x4444;
        const b5 = this.pos > 4 ? this.buf[this.pos - 5] : 0;
        const b6 = this.pos > 5 ? this.buf[this.pos - 6] : 0;
        h[3] = Math.imul(Math.imul(c4, 0x27d4eb2d) ^ ((b5 << 8) | b6), 0x165667b1) ^ 0x6666;
        h[4] = Math.imul(this.wordHash ^ 0x7777, 0x3c6ef372);
        h[5] = Math.imul(Math.imul(this.prevWordHash, 0x85ebca6b) ^ this.wordHash ^ 0x8888, 0x61c88647);
        // Position in line plus the previous byte: helps list markers, indentation and table-like text.
        const column = Math.min(this.pos - this.lineStart, 3);
        const above = this.buf[this.lineStart] ?? 0;
        h[6] = Math.imul(((column << 16) | (above << 8) | c1) + 0x9999999, 0x2545f491);
    }

    private predict() {
        const { inputs, states, slotIndex } = this;
        const c0 = this.c0;
        const c1 = this.c4 & 0xff;
        const mask = (1 << this.tableBits) - 1;
        let seen = 0;

        slotIndex[0] = c0;
        states[0] = this.direct0[c0];
        slotIndex[1] = (c1 << 8) | c0;
        states[1] = this.direct1[slotIndex[1]];
        for (let i = 0; i < HASHED_CONTEXTS; i += 1) {
            let x = Math.imul(this.hashes[i] ^ Math.imul(c0, 0x9e3779b1), 0x85ebca6b);
            x ^= x >>> 15;
            x = Math.imul(x, 0xc2b2ae35);
            x ^= x >>> 13;
            const index = (i << this.tableBits) + ((x >>> 8) & mask);
            const check = x & 0xff;
            if (this.checks[index] !== check) {
                this.checks[index] = check;
                this.slots[index] = 0;
            }
            slotIndex[i + 2] = index;
            const state = this.slots[index];
            states[i + 2] = state;
            if (state !== 0 && i < 4) {
                seen += 1;
            }
        }
        for (let c = 0; c < CONTEXTS; c += 1) {
            const state = states[c];
            inputs[c * 2] = state === 0 ? 0 : STRETCH[this.stateProb[c * STATES + state] >> 4];
            inputs[c * 2 + 1] = CONFIDENCE[state] * this.params.confidence;
        }

        // Match model
        let matchBucket = 0;
        this.matchBit = -1;
        if (this.matchLen > 0) {
            const predicted = this.buf[this.matchPtr] | 0x100;
            if (predicted >> (8 - this.bitPos) === c0) {
                const bit = (predicted >> (7 - this.bitPos)) & 1;
                const len = Math.min(this.matchLen, MAX_MATCH);
                this.matchBit = bit;
                this.matchIndex = len * 2 + bit;
                inputs[CONTEXTS * 2] = STRETCH[this.matchProb[this.matchIndex] >> 4];
                matchBucket = len < 8 ? 1 : len < 16 ? 2 : len < 32 ? 3 : 4;
            } else {
                inputs[CONTEXTS * 2] = 0;
            }
        } else {
            inputs[CONTEXTS * 2] = 0;
        }
        inputs[CONTEXTS * 2 + 1] = 256;
        inputs[CONTEXTS * 2 + 2] = STRETCH[this.counter0[c0] >> 4];
        inputs[CONTEXTS * 2 + 3] = STRETCH[this.counter1[slotIndex[1]] >> 4];

        const selected = this.mixerSelected;
        selected[0] = c0;
        selected[1] = c1;
        selected[2] = (matchBucket * 5 + seen) * REGIMES + this.regime;
        let finalSum = 0;
        const finalBase = (this.regime * 8 + this.bitPos) * MIXER_SETS.length;
        for (let m = 0; m < MIXER_SETS.length; m += 1) {
            const weights = this.weights[m];
            const base = selected[m] * INPUTS;
            let sum = 0;
            for (let i = 0; i < INPUTS; i += 1) {
                sum += weights[base + i] * inputs[i];
            }
            let out = Math.floor(sum / 65536);
            out = out > 2047 ? 2047 : out < -2047 ? -2047 : out;
            this.mixerOut[m] = out;
            finalSum += this.finalWeights[finalBase + m] * out;
        }
        let stretched = Math.floor(finalSum / 65536);
        stretched = stretched > 2047 ? 2047 : stretched < -2047 ? -2047 : stretched;
        this.mixed = squash(stretched);

        // Adaptive probability maps refine the mixed probability in small contexts.
        const s = stretched + 2048;
        const low = s >> 7;
        const w = s & 127;
        this.apmWeightLow = w;
        this.apm0Index = c0 * 33 + low;
        const h1 = (Math.imul((this.c4 & 0xffff) + 1, 0x9e3779b1) >>> 16) ^ c0;
        this.apm1Index = (h1 & 0xffff) * 33 + low;
        const a0 = (this.apm0[this.apm0Index] * (128 - w) + this.apm0[this.apm0Index + 1] * w) >> 11;
        const a1 = (this.apm1[this.apm1Index] * (128 - w) + this.apm1[this.apm1Index + 1] * w) >> 11;
        const refined = (a0 + a1 + 1) >> 1;
        const aw = this.params.apmWeight;
        const p = (this.mixed * (4 - aw) + refined * aw + 2) >> 2;
        this.p = p < 1 ? 1 : p > 4095 ? 4095 : p;
    }

    update(y: number) {
        const { params, inputs, states, slotIndex } = this;
        const target = y << 16;

        // Bit histories and their probability maps
        for (let c = 0; c < CONTEXTS; c += 1) {
            const state = states[c];
            const k = c * STATES + state;
            const n = this.stateCount[k];
            this.stateProb[k] += Math.trunc(((target - this.stateProb[k]) * RATE[n]) / 65536);
            if (n < params.stateLimit) {
                this.stateCount[k] = n + 1;
            }
            const next = NEXT_STATE[state * 2 + y];
            if (c === 0) {
                this.direct0[slotIndex[0]] = next;
            } else if (c === 1) {
                this.direct1[slotIndex[1]] = next;
            } else {
                this.slots[slotIndex[c]] = next;
            }
        }
        const counterTarget = y ? 65535 : 0;
        const i0 = slotIndex[0];
        this.counter0[i0] += Math.trunc(((counterTarget - this.counter0[i0]) * RATE[this.counterN0[i0]]) / 65536);
        if (this.counterN0[i0] < params.directLimit) {
            this.counterN0[i0] += 1;
        }
        const i1 = slotIndex[1];
        this.counter1[i1] += Math.trunc(((counterTarget - this.counter1[i1]) * RATE[this.counterN1[i1]]) / 65536);
        if (this.counterN1[i1] < params.directLimit) {
            this.counterN1[i1] += 1;
        }
        if (this.matchBit >= 0) {
            const k = this.matchIndex;
            const n = this.matchCount[k];
            const matchTarget = y === this.matchBit ? 65535 : 0;
            // The map stores the probability that the predicted bit is right, keyed by the expected bit.
            const current = this.matchBit ? this.matchProb[k] : 65536 - this.matchProb[k];
            const updated = current + Math.trunc(((matchTarget - current) * RATE[n]) / 65536);
            const clamped = updated < 1 ? 1 : updated > 65535 ? 65535 : updated;
            this.matchProb[k] = this.matchBit ? clamped : 65536 - clamped;
            if (n < params.matchLimit) {
                this.matchCount[k] = n + 1;
            }
            if (y !== this.matchBit) {
                this.matchLen = 0;
            }
        }

        // Mixers
        const finalBase = (this.regime * 8 + this.bitPos) * MIXER_SETS.length;
        const finalError = ((y << 12) - this.mixed) * params.finalRate;
        for (let m = 0; m < MIXER_SETS.length; m += 1) {
            const weights = this.weights[m];
            const base = this.mixerSelected[m] * INPUTS;
            const error = ((y << 12) - squash(this.mixerOut[m])) * params.mixerRate;
            for (let i = 0; i < INPUTS; i += 1) {
                weights[base + i] += (inputs[i] * error + 0x8000) >> 16;
            }
            this.finalWeights[finalBase + m] += (this.mixerOut[m] * finalError + 0x8000) >> 16;
        }

        // APMs
        const w = this.apmWeightLow;
        for (const [apm, index] of [
            [this.apm0, this.apm0Index],
            [this.apm1, this.apm1Index],
        ] as const) {
            const near = w < 64 ? index : index + 1;
            apm[near] += (target - apm[near]) >> params.apmRate;
            const clampedNear = apm[near];
            if (clampedNear > 65519) {
                apm[near] = 65519;
            }
        }

        // Recent coding cost selects the regime: predictable text, mixed, or high-entropy data.
        const miss = y ? 4096 - this.p : this.p;
        this.errorAverage += (miss * 16 - this.errorAverage) >> params.regimeRate;

        // Advance bit and byte contexts
        this.c0 = (this.c0 << 1) | y;
        this.bitPos += 1;
        if (this.bitPos === 8) {
            this.byteDone(this.c0 & 0xff);
        }
        this.predict();
    }

    private byteDone(c: number) {
        this.buf[this.pos] = c;
        this.pos += 1;
        this.c4 = ((this.c4 << 8) | c) >>> 0;
        this.c0 = 1;
        this.bitPos = 0;
        const e = this.errorAverage >> 4;
        this.regime = e < 150 ? 0 : e < 350 ? 1 : e < 600 ? 2 : e < 900 ? 3 : e < 1300 ? 4 : 5;
        if (isWordByte(c)) {
            const folded = c >= 65 && c <= 90 ? c + 32 : c;
            this.wordHash = Math.imul(this.wordHash + folded + 1, 0x2f0b4a87) >>> 0;
        } else if (this.wordHash !== 0) {
            this.prevWordHash = this.wordHash;
            this.wordHash = 0;
        }
        if (c === 10) {
            this.lineStart = this.pos;
        }

        // Match model
        const min = this.params.matchMin;
        if (this.matchLen > 0) {
            this.matchPtr += 1;
            if (this.matchLen < 65535) {
                this.matchLen += 1;
            }
        }
        if (this.pos >= min) {
            let h = 0;
            for (let i = this.pos - min; i < this.pos; i += 1) {
                h = Math.imul(h ^ this.buf[i], 0x01000193) + 0x811c9dc5;
            }
            h = (Math.imul(h, 0x9e3779b1) >>> (32 - MATCH_HASH_BITS)) >>> 0;
            if (this.matchLen === 0) {
                const candidate = this.matchTable[h];
                if (candidate > 0) {
                    let len = 0;
                    while (
                        len < MAX_MATCH &&
                        candidate - len > 0 &&
                        this.buf[candidate - 1 - len] === this.buf[this.pos - 1 - len]
                    ) {
                        len += 1;
                    }
                    if (len >= min) {
                        this.matchLen = len;
                        this.matchPtr = candidate;
                    }
                }
            }
            this.matchTable[h] = this.pos;
        }
        this.setByteContexts();
    }

    /** Trains the model on a byte without coding it. */
    learn(bytes: Uint8Array) {
        for (const byte of bytes) {
            for (let i = 7; i >= 0; i -= 1) {
                this.update((byte >> i) & 1);
            }
        }
    }
}

// All model typed arrays, including module-level probability/CRC tables. JS object,
// arithmetic-output, corpus and runtime/worker overhead are reported separately.
export const modelArrayBytes = (capacity: number): number => {
    const bits = tableBitsFor(capacity);
    return (
        capacity +
        1 +
        7 * 4 +
        (7 << bits) * 3 +
        3 * (256 + 65536) * 2 +
        9 * 4 +
        9 * 2 +
        9 * 512 * 4 +
        (1 << 18) * 4 +
        48 * 2 * 4 +
        22 * 4 +
        (256 + 256 + 150) * 22 * 4 +
        3 * 4 * 2 +
        3 * 8 * 6 * 4 +
        (256 + 65536) * 33 * 2 +
        4096 * 2 +
        1024 * 4 +
        512 * 2 * 2 +
        512 * 2 +
        256 * 4
    );
};
const guardModel = (length: number, prime: Uint8Array): void => {
    if (!Number.isSafeInteger(length) || length < 0 || length > CM_MAX_BYTES || prime.length > 64 * 1024) {
        throw new CodecError('CM representation exceeds the supported size (128 KiB).');
    }
    if (modelArrayBytes(length + prime.length) > CM_MAX_MODEL_BYTES) {
        throw new CodecError('CM model exceeds its memory limit.');
    }
};
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, byte) => {
    let crc = byte;
    for (let i = 0; i < 8; i++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return crc >>> 0;
});
export const crc32 = (data: Uint8Array): number => {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255];
    }
    return (crc ^ 0xffffffff) >>> 0;
};

class Encoder {
    private x1 = 0;
    private x2 = 0xffffffff;
    private readonly out: number[] = [];
    encode(y: number, p: number): void {
        const mid = this.x1 + Math.floor(((this.x2 - this.x1) * p) / 4096);
        if (y) {
            this.x2 = mid;
        } else {
            this.x1 = mid + 1;
        }
        while (((this.x1 ^ this.x2) & 0xff000000) === 0) {
            this.out.push(this.x2 >>> 24);
            this.x1 = (this.x1 << 8) >>> 0;
            this.x2 = ((this.x2 << 8) | 255) >>> 0;
        }
    }
    finish(): Uint8Array {
        // EXACTLY four termination bytes, big-endian x1. No omitted/implicit zeros.
        this.out.push(this.x1 >>> 24, (this.x1 >>> 16) & 255, (this.x1 >>> 8) & 255, this.x1 & 255);
        return new Uint8Array(this.out);
    }
}
class Decoder {
    private x1 = 0;
    private x2 = 0xffffffff;
    private x = 0;
    private pos = 0;
    private readonly data: Uint8Array;
    constructor(data: Uint8Array) {
        this.data = data;
        for (let i = 0; i < 4; i++) {
            this.x = ((this.x << 8) | this.next()) >>> 0;
        }
    }
    private next(): number {
        if (this.pos >= this.data.length) {
            throw new CodecError('Truncated CM arithmetic stream.');
        }
        return this.data[this.pos++];
    }
    decode(p: number): number {
        const mid = this.x1 + Math.floor(((this.x2 - this.x1) * p) / 4096);
        const y = this.x <= mid ? 1 : 0;
        if (y) {
            this.x2 = mid;
        } else {
            this.x1 = mid + 1;
        }
        while (((this.x1 ^ this.x2) & 0xff000000) === 0) {
            this.x1 = (this.x1 << 8) >>> 0;
            this.x2 = ((this.x2 << 8) | 255) >>> 0;
            this.x = ((this.x << 8) | this.next()) >>> 0;
        }
        return y;
    }
    finish(): void {
        if (this.pos !== this.data.length || this.x !== this.x1) {
            throw new CodecError('Invalid CM termination or trailing data.');
        }
    }
}
const lengthBytes = (length: number): number[] => {
    const out: number[] = [];
    do {
        out.push((length & 127) | (length > 127 ? 128 : 0));
        length >>>= 7;
    } while (length);
    return out;
};
const compressWithPrime = (data: Uint8Array, prime: Uint8Array): Uint8Array => {
    guardModel(data.length, prime); // Before Model field initializers allocate ANY arrays.
    const encoder = new Encoder();
    if (data.length) {
        const model = new Model(prime.length + data.length, DEFAULT_PARAMS);
        model.learn(prime);
        for (const byte of data) {
            for (let i = 7; i >= 0; i--) {
                const y = (byte >>> i) & 1;
                encoder.encode(y, model.p);
                model.update(y);
            }
        }
    }
    const header = lengthBytes(data.length);
    const checksum = crc32(data);
    header.push(checksum >>> 24, (checksum >>> 16) & 255, (checksum >>> 8) & 255, checksum & 255);
    const coded = encoder.finish();
    const frame = new Uint8Array(header.length + coded.length);
    frame.set(header);
    frame.set(coded, header.length);
    return frame;
};
const decompressWithPrime = (frame: Uint8Array, prime: Uint8Array): Uint8Array => {
    if (frame.length < 9 || frame.length > MAX_BYTES) {
        throw new CodecError('Invalid CM frame size.');
    }
    let length = 0;
    let offset = 0;
    for (; offset < 3; offset++) {
        const byte = frame[offset];
        length += (byte & 127) * 2 ** (offset * 7);
        if (!(byte & 128)) {
            offset++;
            break;
        }
    }
    if (frame[offset - 1] & 128 || lengthBytes(length).length !== offset || frame.length < offset + 8) {
        throw new CodecError('Invalid CM decoded-length framing.');
    }
    guardModel(length, prime);
    const expectedCrc = new DataView(frame.buffer, frame.byteOffset + offset, 4).getUint32(0);
    const decoder = new Decoder(frame.subarray(offset + 4));
    const data = new Uint8Array(length);
    if (length) {
        const model = new Model(prime.length + length, DEFAULT_PARAMS);
        model.learn(prime);
        for (let n = 0; n < length; n++) {
            let byte = 0;
            for (let i = 0; i < 8; i++) {
                const y = decoder.decode(model.p);
                model.update(y);
                byte = (byte << 1) | y;
            }
            data[n] = byte;
        }
    }
    decoder.finish();
    if (crc32(data) !== expectedCrc) {
        throw new CodecError('CM checksum mismatch: the share link is damaged.');
    }
    return data;
};
export const encodeCm = (data: Uint8Array, kind: 'text' | 'structure'): Uint8Array =>
    compressWithPrime(data, cmPrime(kind));
export const decodeCm = (frame: Uint8Array, kind: 'text' | 'structure'): Uint8Array =>
    decompressWithPrime(frame, cmPrime(kind));
// Offline corpus challenger only. V2 mode decoding NEVER accepts a caller-supplied prime.
export const cmResearch = Object.freeze({ compress: compressWithPrime, decompress: decompressWithPrime });
