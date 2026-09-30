// Run this in its OWN process. Never inside the unit suite's mocked module registry.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { browserCompression } from '../../src/lib/compression';
import { runWireContract, type Golden } from '../../tests/contract/wire-contract';
import { runWorkerContract } from '../../tests/contract/worker-contract';
const offline = process.argv.includes('--native');
const output = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'docs/implementation/evidence/wire-contract.json';
const runtime = offline ? (await import('../offline/native-compression')).nativeCompression : browserCompression;
if (!offline && !await runtime.brotliAvailable()) throw new Error('Actual installed Brotli WASM is required. Do not count a deflate fallback as the acceptance run.');
const goldenBytes = readFileSync('tests/fixtures/wire-golden.json');
const golden = JSON.parse(goldenBytes.toString()) as Golden;
const started = performance.now();
const cases = [...await runWireContract(runtime, golden, { legacyBrotli: !offline }), ...await runWorkerContract()];
const evidence = { scope: offline ? 'Supplemental native algorithms, not installed WASM or full app acceptance' : 'Isolated installed-WASM and native-deflate wire contracts',
    runtime: process.versions, backend: runtime.name, startedUtc: new Date().toISOString(), elapsedMs: performance.now() - started,
    goldenSha256: createHash('sha256').update(goldenBytes).digest('hex'),
    processPeakRssKiB: process.resourceUsage().maxRSS, processMemoryAfter: process.memoryUsage(),
    summary: Object.fromEntries(['pass','fail','skip'].map(status => [status, cases.filter(c => c.status === status).length])), cases };
if (output.includes('/')) mkdirSync(output.slice(0, output.lastIndexOf('/')), { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2)+'\n');
console.log(JSON.stringify({ output, summary: evidence.summary, elapsedMs: evidence.elapsedMs, processPeakRssKiB: evidence.processPeakRssKiB }));
for (const failure of cases.filter(c => c.status === 'fail')) console.error(failure.name, failure.detail);
process.exitCode = cases.some(c => c.status === 'fail') ? 1 : 0;
