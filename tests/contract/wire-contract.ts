// Isolated, dependency-mock-free wire contract. Also run in a real browser via the
// offline harness. Bun's broad unit suite mocks compressors, so is NOT this proof.
import { uint8ToBase64url } from '../../src/codecs/base64url';
import { CodecError } from '../../src/codecs/types';
import { decode as decodeV1 } from '../../src/codecs/v1';
import { CM_MAX_BYTES, CM_MAX_MODEL_BYTES, MAX_BYTES, MODES } from '../../src/codecs/v2-constants';
import { canonicalState, sameJson, utf8, type Json, type Obj } from '../../src/codecs/v2-json';
import { decodeRepresentation, plainState, representationBodies } from '../../src/codecs/v2-representations';
import { encodeWindow8 } from '../../src/codecs/v2-unicode';
import { decode, encodeWithReport } from '../../src/codecs/v2';
import { cmResearch, crc32, encodeCm, modelArrayBytes } from '../../src/lib/cm-codec';
import { readBoundedChunks, type CompressionRuntime } from '../../src/lib/compression';
export type Golden = { inputs: Record<string, Obj>; entries: { name: string; input: string; version: string; compression?: string; mode?: { tag: string; representation: string; unicode: string; compression: string }; fragment: string }[] };
export type CaseResult = { name: string; status: 'pass' | 'fail' | 'skip'; elapsedMs: number; detail?: string };
const check = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const equal = (actual: unknown, expected: unknown): void => check(sameJson(actual as Json, expected as Json), 'Exact JSON equality failed.');
const raw = (tag: string, text: string): string => tag + uint8ToBase64url(utf8.encode(text));
const reject = async (operation: () => unknown | Promise<unknown>): Promise<void> => {
    let error: unknown;
    try { await operation(); } catch (failure) { error = failure; }
    check(error instanceof CodecError, `Expected CodecError, received ${error instanceof Error ? error.name + ': ' + error.message : String(error)}`);
};
const scalarState = (text: string): Obj => {
    const state = plainState('placeholder');
    ((state.root as Obj).children as Obj[])[0].children = [{ detail: 0, format: 0, mode: 'normal', style: '', version: 1, type: 'text', text }];
    return state;
};
export const runWireContract = async (runtime: CompressionRuntime, golden: Golden, options: { legacyBrotli?: boolean; fuzzCount?: number } = {}): Promise<CaseResult[]> => {
    const results: CaseResult[] = [];
    const test = async (name: string, run: () => unknown | Promise<unknown>): Promise<void> => {
        const began = performance.now();
        try { await run(); results.push({ name, status: 'pass', elapsedMs: performance.now() - began }); }
        catch (error) { results.push({ name, status: 'fail', elapsedMs: performance.now() - began, detail: error instanceof Error ? error.stack : String(error) }); }
    };
    const hasBrotli = await runtime.brotliAvailable();
    for (const entry of golden.entries) {
        if ((entry.version === 'v1' && entry.compression === 'brotli' && !options.legacyBrotli) || (entry.mode?.compression === 'brotli' && !hasBrotli)) {
            results.push({ name: `golden/${entry.name}`, status: 'skip', elapsedMs: 0, detail: entry.version === 'v1' ? 'Actual legacy Brotli/WASM path unavailable in this runtime.' : 'Brotli unavailable; do not count fallback as Brotli evidence.' });
            continue;
        }
        await test(`golden/${entry.name}`, async () => {
            const state = entry.version === 'v1' ? await decodeV1(entry.fragment) : await decode(entry.fragment, { runtime });
            equal(state, golden.inputs[entry.input]);
            if (entry.mode?.compression === 'cm') {
                const body = [...representationBodies(golden.inputs[entry.input])].find(body => body.representation === entry.mode?.representation);
                check(body, 'Golden representation is no longer expressible.');
                if (!body) return;
                const bytes = entry.mode.unicode === 'utf8' ? utf8.encode(body.text) : encodeWindow8(body.text);
                const frame = encodeCm(bytes, ['text', 'markdown'].includes(body.representation) ? 'text' : 'structure');
                check(entry.mode.tag + uint8ToBase64url(frame) === entry.fragment, 'CM bitstream changed.');
            }
        });
    }
    const unusual: [string, Obj][] = [
        ['BOM controls', scalarState('\uFEFF\u0000\u007f\u0080 ~%20 # ? \t\r\n')],
        ['lone surrogates', scalarState('high\ud800 low\udfff end')],
        ['empty root', { root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 } }],
        ['blank trailing paragraphs', plainState('\n\nA\n\n')],
        ['missing fields', { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'sparse' }] }] } }],
        ['unknown node and alias collisions', { ...plainState('x'), custom: { children: [], c: ['collision'], type: 'future', t: 'x', text: 'long', tx: 'short', nested: { mode: 'normal', m: 'p' } } }],
        ['prototype-looking names', JSON.parse('{"root":{"type":"future","children":[],"__proto__":{"polluted":true},"constructor":"data","toString":"also data"},"__proto__":{"x":1}}')],
        ['unexpected text and children', { root: { type: 'root', children: [{ type: 'future', text: 'text', children: [1, null, 'data'] }], note: ['r', 't', 'x'] } }],
        ['multiple text runs', { root: { ...(plainState('x').root as Obj), children: [{ ...((plainState('x').root as Obj).children as Obj[])[0], children: [
            { detail: 0, format: 0, mode: 'normal', style: '', version: 1, type: 'text', text: 'a' },
            { detail: 0, format: 0, mode: 'normal', style: '', version: 1, type: 'text', text: 'b' },
        ] }] } }],
    ];
    for (const [name, state] of unusual) await test(`losslessness/${name}`, async () => {
        canonicalState(state as never);
        for (const body of representationBodies(state)) {
            equal(decodeRepresentation(body.representation, body.text), state);
            const mode = MODES.find(mode => mode.representation === body.representation && mode.unicode === 'utf8' && mode.compression === 'raw');
            check(mode, 'Missing raw mode.');
            if (mode) equal(await decode(raw(mode.tag, body.text), { runtime }), state);
        }
        const report = await encodeWithReport(state as never, { runtime, includeCm: false, budgetMs: Infinity, qualities: [4, 11] });
        equal(await decode(report.fragment, { runtime }), state);
        const minimum = Math.min(...report.candidates.filter(candidate => candidate.status === 'valid').map(candidate => candidate.fragmentChars as number));
        check(report.fragment.length === minimum, 'Selector did not retain the shortest completed admissible candidate.');
        check(({} as Record<string, unknown>).polluted === undefined, 'Prototype pollution.');
    });
    const malformed = [
        '', '4', '-', '_', 'Q*', 'QA', 'QZh', 'QZg=', 'QZg==', 'Q Zg', '.%', '.%2', '.%GG', '.%ED%A0%80', '.a/b', '.a?b',
        'Q_w', 'QwK8', 'Q7aCA', 'Q9JCAgA', 'U', 'UAA', 'UIgA', 'UAbA', 'UAAF_Ag',
        raw('A', 'null'), raw('A', '[]'), raw('A', '{"root":null}'), raw('A', '{'),
        raw('g', '[99]'), raw('g', '[[99,null]]'), raw('g', '[[2,"x",0,{},9]]'),
        raw('g', '[[2,"x",0,{"text":"override"}]]'), raw('g', '[[10,"not-null"]]'),
        raw('g', '{"r":[0,[]],"e":{"root":{}}}'), raw('g', '[[15,1,2]]'),
        raw('Y', '{"r":{"t":0,"c":[],"unknown":1}}'), raw('Y', '{"r":{"j":{},"t":0}}'),
        raw('o', '[[[[14,99]]],"x"]'), raw('o', '[[[[14,-1]]],"x"]'), raw('o', '[[[[14,0.5]]],"x"]'),
        raw('o', '[[],"unconsumed"]'), raw('I', '{"r":{"t":"ro","type":"root"}}'),
        raw('w', '**unfinished'), raw('w', 'a\n'), raw('w', 'a\n\n\nb'), raw('w', '- a\n3. b'),
        raw('w', '```ts\nx'), raw('w', '[x](unfinished'), raw('w', '\\'),
    ];
    for (let i = 0; i < malformed.length; i++) await test(`malformed/${i}`, () => reject(() => decode(malformed[i], { runtime })));
    await test('literal/escape exactly once', async () => equal(await decode('.%7E%2520%25', { runtime }), plainState('~%20%')));
    await test('literal/explicit empty differs from empty fragment', async () => { equal(await decode('.', { runtime }), plainState('')); await reject(() => decode('', { runtime })); });
    await test('raw/oversize representation', () => reject(() => decode(raw('Q', 'x'.repeat(MAX_BYTES + 1)), { runtime })));
    await test('reconstruction/text bytes', () => reject(() => decode(raw('Q', 'x'.repeat(MAX_BYTES)), { runtime })));
    await test('reconstruction/paragraph count', () => reject(() => decode(raw('Q', '\n'.repeat(6001)), { runtime })));
    await test('reconstruction/tuple node budget', () => reject(() => decode(raw('g', JSON.stringify([Array.from({ length: 20_001 }, () => '')])), { runtime })));
    await test('reconstruction/tuple expansion bytes', () => reject(() => decode(raw('g', JSON.stringify([Array.from({ length: 15_000 }, () => 'x'.repeat(64))])), { runtime })));
    await test('reconstruction/depth', () => reject(() => decode(raw('A', `{"root":{"nested":${'['.repeat(65)}0${']'.repeat(65)}}}`), { runtime })));
    await test('CM/CRC32 standard vector', () => check(crc32(utf8.encode('123456789')) === 0xcbf43926, 'CRC32 mismatch.'));
    await test('CM/preallocation model budget', () => check(modelArrayBytes(CM_MAX_BYTES + 64 * 1024) <= CM_MAX_MODEL_BYTES, 'Model arrays exceed budget.'));
    await test('CM/encode size cap', () => reject(() => encodeCm(new Uint8Array(CM_MAX_BYTES + 1), 'text')));
    for (const bytes of [[128,128,8,0,0,0,0,0,0,0,0], [128,0,0,0,0,0,0,0,0,0], [128,128,128,0,0,0,0,0,0,0,0]]) {
        await test(`CM/invalid length ${bytes.slice(0,3)}`, () => reject(() => decode('T' + uint8ToBase64url(new Uint8Array(bytes)), { runtime })));
    }
    const frame = encodeCm(utf8.encode('A small note about the next meeting.'), 'text');
    for (let i = 0; i < frame.length; i++) {
        await test(`CM/public truncation ${i}`, () => reject(() => decode('T' + uint8ToBase64url(frame.slice(0, i)), { runtime })));
        await test(`CM/public bit corruption ${i}`, () => {
            const changed = frame.slice(); changed[i] ^= 1;
            return reject(() => decode('T' + uint8ToBase64url(changed), { runtime }));
        });
    }
    await test('CM/public trailing byte', () => reject(() => decode('T' + uint8ToBase64url(new Uint8Array([...frame, 0])), { runtime })));
    for (const kind of ['deflate', 'brotli'] as const) {
        if (kind === 'brotli' && !hasBrotli) { results.push({ name: 'brotli/bomb and framing', status: 'skip', elapsedMs: 0 }); continue; }
        const tag = kind === 'deflate' ? 'R' : 'S';
        await test(`${kind}/decompression bomb bounded`, async () => {
            const packed = await runtime.compress(kind, utf8.encode('x'.repeat(MAX_BYTES + 1)), 4);
            await reject(() => decode(tag + uint8ToBase64url(packed), { runtime }));
        });
        const packed = await runtime.compress(kind, utf8.encode('golden content'), 4);
        await test(`${kind}/truncation`, () => reject(() => decode(tag + uint8ToBase64url(packed.slice(0, -1)), { runtime })));
        await test(`${kind}/trailing input`, () => reject(() => decode(tag + uint8ToBase64url(new Uint8Array([...packed, 0])), { runtime })));
    }
    await test('stream/early cancel and unlock', async () => {
        let cancelled = false;
        let pulls = 0;
        const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } });
        let failed = false;
        try { await readBoundedChunks(stream, 512); } catch { failed = true; }
        check(failed && cancelled && !stream.locked && pulls <= 2, 'Output was not bounded/cancelled/unlocked.');
    });
    let seed = 0x62b19d7;
    const next = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let i = 0; i < (options.fuzzCount ?? 150); i++) await test(`fuzz/seeded bytes and JSON ${i}`, async () => {
        const bytes = Uint8Array.from({ length: next() % 256 }, () => next() >>> 24);
        const compressed = cmResearch.compress(bytes, new Uint8Array());
        const restored = cmResearch.decompress(compressed, new Uint8Array());
        check(bytes.length === restored.length && bytes.every((byte, index) => byte === restored[index]), 'Seeded CM byte mismatch.');
        const chars = Array.from({ length: next() % 40 }, () => String.fromCharCode(next() & 65535)).join('');
        const state = scalarState(chars);
        state.metadata = JSON.parse(`{"text":"${i}","tx":${next()},"__proto__":{"value":${i}}}`);
        for (const body of representationBodies(state)) {
            const mode = MODES.find(mode => mode.representation === body.representation && mode.unicode === 'utf8' && mode.compression === 'raw');
            if (mode) equal(await decode(raw(mode.tag, body.text), { runtime }), state);
        }
    });
    const fallbackRuntime: CompressionRuntime = { name: 'failure injection (not size proof)', brotliAvailable: async () => false,
        compress: async () => { throw new Error('Unavailable compressor.'); }, decompress: async () => { throw new Error('Unexpected compressed fallback.'); } };
    await test('selector/raw fallback survives compressor failures', async () => {
        const report = await encodeWithReport(golden.inputs.rich as never, { runtime: fallbackRuntime, budgetMs: Infinity, includeCm: false });
        equal(await decode(report.fragment, { runtime: fallbackRuntime }), golden.inputs.rich);
        check(report.candidates.some(candidate => candidate.status === 'error'), 'Expected recorded compressor failure.');
    });
    await test('selector/baseline before deadline and progress', async () => {
        const progress: string[] = [];
        const report = await encodeWithReport(golden.inputs.text as never, { runtime, budgetMs: 0.0001, onProgress: fragment => progress.push(fragment) });
        check(progress.length === 1 && ['K', 'J'].includes(progress[0][0]), 'First completed baseline is not v1-compatible.');
        equal(await decode(report.fragment, { runtime }), golden.inputs.text);
        check(report.budgetReached, 'Budget not recorded.');
    });
    return results;
};
