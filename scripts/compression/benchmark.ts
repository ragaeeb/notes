// Unified full-wire measurement. Defaults require frozen REAL Lexical exports and WASM.
// --native explicitly selects supplemental reconstructed inputs and native Brotli.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { uint8ToBase64url } from '../../src/codecs/base64url';
import { decode, encodeWithReport, type EncodeReport } from '../../src/codecs/v2';
import { sameJson, utf8, type Json } from '../../src/codecs/v2-json';
import { v1Body } from '../../src/codecs/v2-representations';
import { browserCompression } from '../../src/lib/compression';
import { CORPUS_HASHES as CM_CORPUS_HASHES } from '../../src/lib/cm-v2-corpus';
const native = process.argv.includes('--native');
const set = process.argv.find(arg => arg.startsWith('--set='))?.slice(6) ?? 'development';
assert(['development','evaluation','all'].includes(set), 'Invalid fixture set.');
const profile = process.argv.includes('--shipping') ? 'shipping' : 'exhaustive';
const output = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? `docs/implementation/evidence/${native?'native':'wasm'}-${set}-${profile}.json`;
const sha = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const runtime = native ? (await import('../offline/native-compression')).nativeCompression : browserCompression;
assert(await runtime.brotliAvailable(), 'This joint benchmark requires the declared real Brotli backend.');
const inputFile = process.argv.find(arg => arg.startsWith('--fixtures='))?.slice(11) ?? 'docs/implementation/fixtures/lexical-export.json';
const allInputs = native ? (await import('../offline/fixture-states')).offlineFixtures() : JSON.parse(readFileSync(inputFile, 'utf8')).fixtures;
const inputs = allInputs.filter((fixture: { set: string }) => set==='all'||fixture.set===set);
assert(inputs.length>0, 'No input fixtures.');
const manifest = { provenance: native ? 'Supplemental v2-default/reconstructed states, NOT original Lexical-exported 14+8+17 ASTs; independently authored evaluation ASTs.' : 'Frozen installed Lexical exports',
    fixtureHash: sha(JSON.stringify(allInputs)), fixtures: allInputs.map((f: {id:string;state:Json;set:string})=>({id:f.id,set:f.set,stateSha256:sha(JSON.stringify(f.state))})),
    corpusHashes: CM_CORPUS_HASHES, lockSha256: sha(readFileSync('bun.lock')), evaluationSourceSha256:sha(readFileSync('tests/fixtures/evaluation-sources.json')),
    evaluationRichSha256:sha(readFileSync('tests/fixtures/evaluation-rich-states.json')) };
const previous = process.argv.includes('--resume') && existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : null;
if (previous) assert(previous.manifest.fixtureHash === manifest.fixtureHash && previous.profile === profile && previous.set === set, 'Resume input or profile drift.');
const records = previous?.records ?? [];
const batchLimit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.slice(8) ?? Infinity);
let added = 0;
for (const input of inputs) {
    if (records.some((record: { id: string }) => record.id === input.id)) continue;
    if (added++ >= batchLimit) break;
    const fallbackBody = v1Body(input.state);
    let baseline = null;
    if (fallbackBody !== null) {
        let fragment: string;
        if (native) {
            const packed = await runtime.compress('brotli',utf8.encode(fallbackBody),11);
            const bytes = new Uint8Array(packed.length+3); bytes.set([1,1,0]); bytes.set(packed,3);
            fragment = uint8ToBase64url(bytes);
        } else {
            const legacy = await import('../../src/codecs/v1');
            fragment = await legacy.encode(input.state);
            assert(sameJson(await legacy.decode(fragment) as Json,input.state), 'Unchanged v1 failed its declared eligibility gate.');
        }
        baseline = { method: native ? 'Frozen v1 transform/header with same declared Brotli backend, quality 11' : 'Unchanged public src/codecs/v1.ts encoder and decoder, actual installed WASM', fragmentChars:fragment.length,
            fullUrlChars:new URL(`/v1/#${fragment}`,'https://notes.ilmtest.io').href.length };
    }
    const reports: EncodeReport[] = [];
    const repeats = profile==='shipping'?3:1;
    for (let repeat=0;repeat<repeats;repeat++) {
        const report = await encodeWithReport(input.state, {runtime,includeCm:true,budgetMs:profile==='shipping'?500:Infinity, search:profile});
        assert(sameJson(await decode(report.fragment,{runtime}) as Json,input.state),`${input.id} selected wire mismatch`);
        const valid = report.candidates.filter(candidate=>candidate.status==='valid');
        assert.equal(report.fragment.length,Math.min(...valid.map(candidate=>candidate.fragmentChars as number)),'Selector differs from shortest completed admissible result.');
        if (baseline) assert(report.fragment.length<=baseline.fragmentChars,`${input.id} regressed versus lossless v1 baseline`);
        reports.push(report);
    }
    const first = reports[0];
    const ordinary = first.candidates.filter(c=>c.status==='valid'&&c.compression!=='cm');
    const noCmChars = ordinary.length ? Math.min(...ordinary.map(c=>c.fragmentChars as number)) : null;
    records.push({id:input.id,name:input.name,set:input.set,inputJsonBytes:utf8.encode(JSON.stringify(input.state)).length,
        inputSha256:sha(JSON.stringify(input.state)), baseline, noCmChars,
        selectedFragment:first.fragment, selectedFragmentChars:first.fragment.length,
        selectedFullUrlChars:new URL(`/v2/#${first.fragment}`,'https://notes.ilmtest.io').href.length,
        fragmentSavingsPercent:baseline?100*(1-first.fragment.length/baseline.fragmentChars):null,
        reports});
    writeFileSync(output,JSON.stringify({status:'in-progress',profile,set,runtime:process.versions,backend:runtime.name,manifest,records},null,2)+'\n');
    console.log(`${input.id}: v1=${baseline?.fragmentChars??'ineligible'}, no-CM=${noCmChars}, v2=${first.fragment.length}, ${Math.round(first.elapsedMs)}ms, ${first.candidates.filter(c=>c.status==='error').length} candidate errors`);
}
const summary = {documents:records.length,candidates:records.reduce((n,r)=>n+r.reports.reduce((n,q)=>n+q.candidates.length,0),0),
    candidateErrors:records.reduce((n,r)=>n+r.reports.reduce((n,q)=>n+q.candidates.filter(c=>c.status==='error').length,0),0),
    noGrowthFailures:0,selectionMismatches:0,exactRoundTripFailures:0};
writeFileSync(output,JSON.stringify({status:records.length===inputs.length?'complete':'in-progress',scope:native?'Supplemental native run, not shipping browser/WASM acceptance':'Installed WASM run; browser/device qualification still separate',
    profile,set,runtime:process.versions,backend:runtime.name,manifest,summary,processPeakRssKiB:process.resourceUsage().maxRSS,
    memoryCaveat:'Peak RSS is this invocation/batch only, not all resumed batches, peak isolated worker or app memory. Records can span resumed processes. Timing mixes JIT/cache states; exhaustive search ignores the worker deadline.',records},null,2)+'\n');
console.log(JSON.stringify({output,summary}));
