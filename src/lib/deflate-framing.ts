// RFC 1951 framing/count-only scanner. It does NOT materialize decompressed bytes.
// Native engines differ in rejecting bytes after BFINAL; validate portably before
// handing a stream to the native inflater. This also bounds decoded size in advance.
// Algorithm specification: https://datatracker.ietf.org/doc/html/rfc1951 §3.2.
const invalid = (): never => {
    throw new Error('Invalid or truncated deflate stream.');
};
type Tree = Map<number, number>;
class Bits {
    position = 0;
    readonly data: Uint8Array;
    constructor(data: Uint8Array) {
        this.data = data;
    }
    read(count: number): number {
        if (this.position + count > this.data.length * 8) {
            return invalid();
        }
        let value = 0;
        for (let i = 0; i < count; i++, this.position++) {
            value |= ((this.data[this.position >>> 3] >>> (this.position & 7)) & 1) << i;
        }
        return value;
    }
    symbol(tree: Tree): number {
        let code = 0;
        for (let length = 1; length <= 15; length++) {
            code = (code << 1) | this.read(1); // Huffman codes are transmitted MSB first.
            const symbol = tree.get((1 << length) | code);
            if (symbol !== undefined) {
                return symbol;
            }
        }
        return invalid();
    }
}
const tree = (lengths: readonly number[]): Tree => {
    const counts = new Uint16Array(16);
    for (const length of lengths) {
        if (!Number.isInteger(length) || length < 0 || length > 15) {
            return invalid();
        }
        if (length) {
            counts[length]++;
        }
    }
    const next = new Uint16Array(16);
    let available = 1;
    for (let length = 1; length <= 15; length++) {
        available = (available << 1) - counts[length];
        if (available < 0) {
            return invalid(); // Oversubscribed tree.
        }
        next[length] = (next[length - 1] + counts[length - 1]) << 1;
    }
    const out: Tree = new Map();
    lengths.forEach((length, symbol) => {
        if (length) {
            out.set((1 << length) | next[length]++, symbol);
        }
    });
    return out;
};
const FIXED_LITERAL = tree(
    Array.from({ length: 288 }, (_, symbol) => (symbol < 144 ? 8 : symbol < 256 ? 9 : symbol < 280 ? 7 : 8)),
);
const FIXED_DISTANCE = tree(Array.from({ length: 32 }, () => 5));
const LENGTH_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
    8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const dynamicTrees = (bits: Bits): [Tree, Tree] => {
    const literals = bits.read(5) + 257;
    const distances = bits.read(5) + 1;
    const codes = bits.read(4) + 4;
    if (literals > 286) {
        return invalid();
    }
    const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
    const codeLengths = Array<number>(19).fill(0);
    for (let i = 0; i < codes; i++) {
        codeLengths[order[i]] = bits.read(3);
    }
    const codeTree = tree(codeLengths);
    const lengths: number[] = [];
    while (lengths.length < literals + distances) {
        const value = bits.symbol(codeTree);
        if (value < 16) {
            lengths.push(value);
        } else {
            if (value === 16 && !lengths.length) {
                return invalid();
            }
            const count =
                value === 16
                    ? bits.read(2) + 3
                    : value === 17
                      ? bits.read(3) + 3
                      : value === 18
                        ? bits.read(7) + 11
                        : invalid();
            if (lengths.length + count > literals + distances) {
                return invalid();
            }
            const length = value === 16 ? lengths[lengths.length - 1] : 0;
            for (let i = 0; i < count; i++) {
                lengths.push(length);
            }
        }
    }
    if (!lengths[256]) {
        return invalid();
    }
    return [tree(lengths.slice(0, literals)), tree(lengths.slice(literals))];
};
export const validateDeflateFraming = (input: Uint8Array, maxBytes: number): number => {
    const bits = new Bits(input);
    let output = 0;
    const add = (length: number): void => {
        output += length;
        if (output > maxBytes) {
            throw new Error('Decompressed content exceeds the size limit.');
        }
    };
    let final = 0;
    do {
        final = bits.read(1);
        const kind = bits.read(2);
        if (kind === 0) {
            bits.position = Math.ceil(bits.position / 8) * 8;
            const length = bits.read(16);
            if ((length ^ bits.read(16)) !== 65535 || bits.position + length * 8 > input.length * 8) {
                return invalid();
            }
            bits.position += length * 8;
            add(length);
        } else {
            if (kind === 3) {
                return invalid();
            }
            const [literalTree, distanceTree] = kind === 1 ? [FIXED_LITERAL, FIXED_DISTANCE] : dynamicTrees(bits);
            while (true) {
                const value = bits.symbol(literalTree);
                if (value < 256) {
                    add(1);
                } else if (value === 256) {
                    break;
                } else {
                    if (value > 285) {
                        return invalid();
                    }
                    const index = value - 257;
                    const length = LENGTH_BASE[index] + bits.read(LENGTH_EXTRA[index]);
                    const distanceSymbol = bits.symbol(distanceTree);
                    if (distanceSymbol > 29) {
                        return invalid();
                    }
                    const distance = DISTANCE_BASE[distanceSymbol] + bits.read(DISTANCE_EXTRA[distanceSymbol]);
                    if (distance > output) {
                        return invalid();
                    }
                    add(length);
                }
            }
        }
    } while (!final);
    // The unused high bits of the final byte are padding permitted by RFC 1951.
    if (Math.ceil(bits.position / 8) !== input.length) {
        throw new Error('Unexpected trailing deflate input.');
    }
    return output;
};
