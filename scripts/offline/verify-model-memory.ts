// Records typed arrays actually constructed inside Model, not a heap/RSS claim.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cmResearch, modelArrayBytes } from '../../src/lib/cm-codec';
const input = new Uint8Array(128 * 1024).fill(97);
const prime = new Uint8Array(64 * 1024).fill(32);
const arrays: {type:string;bytes:number}[] = [];
const originals = new Map<string, unknown>();
const globals = globalThis as unknown as Record<string, unknown>;
for (const type of ['Uint8Array','Int8Array','Uint16Array','Int16Array','Uint32Array','Int32Array']) {
    const original = globals[type] as typeof Uint8Array;
    originals.set(type, original);
    globals[type] = new Proxy(original, { construct(target,args,newTarget) {
        const result = Reflect.construct(target,args,newTarget) as Uint8Array;
        if (new Error().stack?.includes('new Model')) arrays.push({type,bytes:result.byteLength});
        return result;
    } });
}
try { cmResearch.compress(input,prime); }
finally { for (const [key,value] of originals) globals[key]=value; }
const dynamicBytes = arrays.reduce((sum,array)=>sum+array.bytes,0);
const moduleTableBytes = 4096*2+1024*4+512*2*2+512*2+256*4;
assert.equal(dynamicBytes+moduleTableBytes,modelArrayBytes(input.length+prime.length));
const output='docs/implementation/evidence/cm-model-allocations.json';
mkdirSync('docs/implementation/evidence', { recursive: true });
writeFileSync(output,JSON.stringify({scope:'Instrumented native Model typed-array constructors at maximum allowed data + prime capacity; static module table sizes counted separately. NOT total model heap, worker, process or app memory.',runtime:process.versions,
    inputBytes:input.length,primeBytes:prime.length,dynamicBytes,moduleTableBytes,totalModelArrayBytes:dynamicBytes+moduleTableBytes,
    capBytes:16*1024*1024,arrays,pass:true},null,2)+'\n');
console.log(JSON.stringify({output,dynamicBytes,moduleTableBytes,totalModelArrayBytes:dynamicBytes+moduleTableBytes}));
