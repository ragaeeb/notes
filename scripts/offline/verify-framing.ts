// Differential real-zlib evidence for the portable count-only RFC 1951 validator.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { constants, deflateRawSync, inflateRawSync } from 'node:zlib';
import { validateDeflateFraming } from '../../src/lib/deflate-framing';
import { cmCompress, cmDecompress } from '../cm-codec';
import { cmResearch, modelArrayBytes } from '../../src/lib/cm-codec';
const checks: { name: string; status: string }[] = [];
const test = (name: string, run: () => void): void => { run(); checks.push({ name, status: 'pass' }); };
let seed = 0x93a710cd;
const random = (): number => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const lengths = [0,1,2,3,4,7,31,128,511,4096,32768,65537,131073,2097152];
for (const length of lengths) {
    for (const distribution of ['repeated','random','mixed']) {
        const input = Uint8Array.from({ length }, (_, i) => distribution === 'repeated' ? 97 : distribution === 'mixed' && i % 71 < 60 ? i % 5 + 97 : random() & 255);
        for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FIXED, constants.Z_HUFFMAN_ONLY, constants.Z_RLE]) {
            for (const level of [0,1,6,9]) {
                const packed = deflateRawSync(input, { level, strategy });
                const label = `${length}/${distribution}/strategy-${strategy}/level-${level}`;
                test(`valid/${label}`, () => {
                    assert.equal(validateDeflateFraming(packed, input.length), input.length);
                    assert.deepEqual(new Uint8Array(inflateRawSync(packed)), input);
                });
                test(`trailing/${label}`, () => assert.throws(() => validateDeflateFraming(Buffer.concat([packed, Buffer.from([0])]), input.length)));
                test(`truncated/${label}`, () => assert.throws(() => validateDeflateFraming(packed.subarray(0,-1), input.length)));
                if (length) test(`limit/${label}`, () => assert.throws(() => validateDeflateFraming(packed, input.length-1)));
            }
        }
    }
}
const text = 'A small note about the next meeting.';
const input = new TextEncoder().encode(text);
const emptyPrime = new Uint8Array();
const prototype = cmCompress(input, emptyPrime);
const damagedPrototype = new TextDecoder().decode(cmDecompress(prototype.slice(0,-1), emptyPrime));
test('prototype/regression reproduced (silent wrong output)', () => { assert.equal(prototype.length,28); assert.notEqual(damagedPrototype,text); });
const repaired = cmResearch.compress(input, emptyPrime);
test('CM/new frame round-trip', () => assert.deepEqual(cmResearch.decompress(repaired,emptyPrime), input));
for (let n=0;n<repaired.length;n++) test(`CM/new frame rejects prefix ${n}`, () => assert.throws(() => cmResearch.decompress(repaired.slice(0,n),emptyPrime)));
const output = 'docs/implementation/evidence/native-framing-differential.json';
writeFileSync(output, JSON.stringify({ scope:'Real native zlib differential framing/count tests and original prototype regression. Not browser or WASM evidence.',runtime:process.versions,
    summary:{pass:checks.length,fail:0}, seed:'0x93a710cd',lengths,strategies:['default','fixed','Huffman-only','RLE'],levels:[0,1,6,9],
    prototype:{input:text,inputBytes:input.length,frameBytes:prototype.length,truncatedResult:damagedPrototype},repairedFrameBytes:repaired.length,
    modelArrayBytesAtMaxCapacity:modelArrayBytes(128*1024+64*1024), processPeakRssKiB:process.resourceUsage().maxRSS,checks },null,2)+'\n');
console.log(JSON.stringify({output,pass:checks.length,prototypeBytes:prototype.length,repairedFrameBytes:repaired.length}));
