import { browserCompression } from './src/lib/compression.js';
import { plainState } from './src/codecs/v2-representations.js';
import { sameJson } from './src/codecs/v2-json.js';
import { runWireContract } from './tests/contract/wire-contract.js';
import { runWorkerContract } from './tests/contract/worker-contract.js';
import { runCodecJob } from './src/codecs/worker-client.js';
const started = performance.now();
const golden = await (await fetch('/tests/fixtures/wire-golden.json')).json();
const cases = [...await runWireContract(browserCompression, golden), ...await runWorkerContract()];
const workers = [];
const createWorker = () => {
    const worker = new Worker('/src/codecs/v2.worker.js', { type: 'module' });
    const record = { terminated: 0, messages: 0 };
    workers.push(record);
    const terminate = worker.terminate.bind(worker);
    worker.terminate = () => { record.terminated++; terminate(); };
    worker.addEventListener('message', () => record.messages++);
    return worker;
};
const actual = async (name, run) => {
    const t = performance.now();
    try { await run(); cases.push({name, status: 'pass', elapsedMs: performance.now()-t}); }
    catch (error) { cases.push({name, status: 'fail', elapsedMs: performance.now()-t, detail: String(error.stack ?? error)}); }
};
const ensure = (condition, text) => { if (!condition) throw Error(text); };
const timings = [];
for (let i = 0; i < 6; i++) await actual(`real worker/share-load ${i}`, async () => {
    const input = plainState('Meet Alex at 3pm. Bring the notes and confirm the room.');
    const t = performance.now();
    const fragment = await runCodecJob({ operation:'encode', version:'v2', includeCm:true, state:input }, { createWorker });
    const encodedAt = performance.now();
    const restored = await runCodecJob({ operation:'decode', version:'v2', fragment }, { createWorker });
    const decodedAt = performance.now();
    ensure(sameJson(restored,input), 'Actual worker did not round-trip.');
    timings.push({ attempt:i, cacheState:i===0?'first worker after contracts (not cold page)':'new worker; main page already warm; worker fetch/cache state not isolated', fragment, fragmentChars:fragment.length,
        encodeMs:encodedAt-t, decodeMs:decodedAt-encodedAt });
});
await actual('real worker/explicit empty', async () => {
    const result = await runCodecJob({operation:'decode',version:'v2',fragment:'.'}, {createWorker});
    ensure(sameJson(result,plainState('')), 'Empty document changed.');
});
await actual('real worker/v1 fixed deflate link', async () => {
    const entry = golden.entries.find(entry => entry.name==='text-v1-deflate');
    const result = await runCodecJob({operation:'decode',version:'v1',fragment:entry.fragment}, {createWorker});
    ensure(sameJson(result,golden.inputs.text), 'v1 changed.');
});
await actual('real worker/cancel while encoding', async () => {
    const controller = new AbortController();
    let rejected = false;
    const promise = runCodecJob({operation:'encode',version:'v2',includeCm:true,state:plainState('Repeated document. '.repeat(5000))}, {createWorker,signal:controller.signal});
    setTimeout(()=>controller.abort(),30);
    try { await promise; } catch(error) { rejected = error.name==='CodecError' && /cancelled/.test(error.message); }
    ensure(rejected, 'Cancelled worker unexpectedly returned a link.');
});
await actual('real worker/decode invalid link', async () => {
    let rejected = false;
    try { await runCodecJob({operation:'decode',version:'v2',fragment:'TAAAAAAAAAAAAAA'}, {createWorker}); }
    catch(error) { rejected = error.name==='CodecError'; }
    ensure(rejected, 'Bad link decoded.');
});
let ticks = 0;
let maxGapMs = 0;
await actual('real worker/main-thread responsiveness', async () => {
    let previous = performance.now();
    const timer = setInterval(()=>{ const now=performance.now(); maxGapMs=Math.max(maxGapMs,now-previous);previous=now;ticks++; },16);
    try {
        await runCodecJob({operation:'encode',version:'v2',includeCm:true,state:plainState('A moderately long paragraph with several fields and references. '.repeat(2000))},{createWorker});
    } finally { clearInterval(timer); }
    ensure(ticks>2 && maxGapMs<250, `Main thread stalled: ${ticks} ticks, gap ${maxGapMs}.`);
});
await actual('real worker/every request terminated', () => ensure(workers.every(w=>w.terminated===1), 'Leaked worker.'));
window.__RESULT__ = { scope:'Actual Chromium core modules and dedicated workers. No React, Vite build, Brotli WASM, Safari/Firefox, or mobile device acceptance.',
    userAgent:navigator.userAgent, backend:browserCompression.name, brotliAvailable:await browserCompression.brotliAvailable(),
    elapsedMs:performance.now()-started, summary:Object.fromEntries(['pass','fail','skip'].map(status=>[status,cases.filter(c=>c.status===status).length])),
    cases, timings, responsiveness:{ticks,maxGapMs}, workerLifecycle:workers,
    pageHeapAfter:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit}:null };
document.getElementById('result').textContent = JSON.stringify({summary:window.__RESULT__.summary,timings,responsiveness:window.__RESULT__.responsiveness},null,2);
