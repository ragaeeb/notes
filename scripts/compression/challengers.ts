// Offline alternate-corpus/dictionary study. NO extra shipping tags or dependencies.
// Each variant proposes replacing a single frozen model/dictionary, not combining them.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { uint8ToBase64url } from '../../src/codecs/base64url';
import { CM_MAX_BYTES, MAX_BYTES } from '../../src/codecs/v2-constants';
import { decodeRepresentation, representationBodies } from '../../src/codecs/v2-representations';
import { sameJson, utf8 } from '../../src/codecs/v2-json';
import { cmResearch, crc32, modelArrayBytes } from '../../src/lib/cm-codec';
import { cmPrime } from '../../src/lib/cm-v2-corpus';
import { offlineFixtures } from '../offline/fixture-states';
const output = process.argv.find(arg=>arg.startsWith('--out='))?.slice(6) ?? 'docs/implementation/evidence/native-challengers-development.json';
const inputs = offlineFixtures().filter(f=>f.set==='development');
const sha = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');
const prime30 = new Uint8Array(readFileSync('docs/implementation/fixtures/cm-prime-30k.txt'));
const prime60 = new Uint8Array(readFileSync('docs/implementation/fixtures/cm-prime-60k.txt'));
const dictionary = new Uint8Array(readFileSync('docs/implementation/fixtures/dictionary-32k.bin'));
const manifest = { inputSha256:sha(JSON.stringify(inputs)), corpus30Sha256:sha(prime30),corpus60Sha256:sha(prime60),dictionarySha256:sha(dictionary) };
const previous = process.argv.includes('--resume') && existsSync(output) ? JSON.parse(readFileSync(output,'utf8')) : null;
if (previous) assert.deepEqual(previous.manifest,manifest,'Challenger inputs drifted.');
const records = previous?.records ?? [];
const limit = Number(process.argv.find(arg=>arg.startsWith('--limit='))?.slice(8) ?? Infinity);
const baseline = JSON.parse(readFileSync('docs/implementation/evidence/native-development-exhaustive.json','utf8'));
const dictionaryFrame = (bytes: Uint8Array): Uint8Array => {
    let length = bytes.length;
    const header: number[] = [];
    do { header.push((length&127)|(length>127?128:0));length>>>=7; } while(length);
    const checksum = crc32(bytes);
    header.push(checksum>>>24,(checksum>>>16)&255,(checksum>>>8)&255,checksum&255);
    return new Uint8Array([...header,...deflateRawSync(bytes,{dictionary,level:9})]);
};
const decodeDictionary = (frame: Uint8Array): Uint8Array => {
    let length=0,offset=0;
    do { const byte=frame[offset];length+=(byte&127)*2**(offset*7);offset++;if(!(byte&128))break;assert(offset<4); } while(true);
    assert(length<=MAX_BYTES);
    const expected=new DataView(frame.buffer,frame.byteOffset+offset,4).getUint32(0);
    const decoded=new Uint8Array(inflateRawSync(frame.subarray(offset+4),{dictionary,maxOutputLength:MAX_BYTES}));
    assert.equal(decoded.length,length);assert.equal(crc32(decoded),expected);return decoded;
};
let added=0;
for(const input of inputs) {
    if(records.some((r:{id:string})=>r.id===input.id))continue;
    if(added++>=limit)break;
    const candidates=[];
    for(const body of representationBodies(input.state)) {
        const bytes=utf8.encode(body.text);
        if(bytes.length>CM_MAX_BYTES)continue;
        for(const variant of ['current','30k','60k','dictionary'] as const) {
            const prime=variant==='current'?cmPrime(['text','markdown'].includes(body.representation)?'text':'structure'):variant==='30k'?prime30:prime60;
            const started=performance.now();
            const frame=variant==='dictionary'?dictionaryFrame(bytes):cmResearch.compress(bytes,prime);
            const encodedAt=performance.now();
            const restored=variant==='dictionary'?decodeDictionary(frame):cmResearch.decompress(frame,prime);
            const decodedAt=performance.now();
            assert.deepEqual(restored,bytes);
            assert(sameJson(decodeRepresentation(body.representation,new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(restored)),input.state));
            // One proposed ASCII tag is charged, plus the ENTIRE CRC/length/termination frame.
            // '4' is RESERVED in v2; these values are comparisons, not usable share links.
            const fragment='4'+uint8ToBase64url(frame);
            candidates.push({representation:body.representation,unicode:'utf8',variant,representationBytes:bytes.length,
                corpusBytes:variant==='dictionary'?dictionary.length:prime.length,frameBytes:frame.length,fragmentChars:fragment.length,
                urlChars:new URL(`/v2/#${fragment}`,'https://notes.ilmtest.io').href.length,encodeMs:encodedAt-started,decodeMs:decodedAt-encodedAt,
                modelArrayBytes:variant==='dictionary'?null:modelArrayBytes(prime.length+bytes.length)});
        }
    }
    const current=baseline.records.find((r:{id:string})=>r.id===input.id);
    records.push({id:input.id,inputSha256:sha(JSON.stringify(input.state)),currentCombinedFragmentChars:current.selectedFragmentChars,candidates});
    writeFileSync(output,JSON.stringify({status:'in-progress',manifest,records},null,2)+'\n');
    console.log(`${input.id}: ${candidates.length} verified challenger candidates`);
}
const summary=Object.fromEntries(['current','30k','60k','dictionary'].map(variant=>[variant,{
    documents:records.length,candidates:records.reduce((n,r)=>n+r.candidates.filter(c=>c.variant===variant).length,0),
    uniqueWinsOverCurrentCombined:records.filter(r=>Math.min(...r.candidates.filter(c=>c.variant===variant).map(c=>c.fragmentChars))<r.currentCombinedFragmentChars).map(r=>({id:r.id,current:r.currentCombinedFragmentChars,challenger:Math.min(...r.candidates.filter(c=>c.variant===variant).map(c=>c.fragmentChars))}))
}]));
writeFileSync(output,JSON.stringify({status:records.length===inputs.length?'complete':'in-progress',scope:'Native-only development challenger; UTF-8 bodies, hypothetical complete one-tag framing. Not emitted by v2 and not browser-qualified.',
    trainingProvenance:'Deterministic independently authored synthetic technical augmentation of the original corpus. Highly repetitive; NOT a 30/60 KB independently collected natural-language corpus. Training assets were frozen without reading evaluation inputs.',
    runtime:process.versions,manifest,summary,processPeakRssKiB:process.resourceUsage().maxRSS,
    limitations:'Single pass per candidate, model freshly allocated/primed. Resumed batches mix cold/JIT/cache states; RSS is this batch only. Dictionary has no browser decoder, so its timing excludes browser dependency startup. No Unicode-window challenger sweep.',records},null,2)+'\n');
console.log(JSON.stringify({output,summary}));
