// Network-free Chromium execution when managed policy forbids navigation. This is
// NOT Vite output. Local CommonJS wrappers contain the transpiled production source.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_PATH || '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const paths = ['src/codecs','src/lib','tests/contract'].flatMap(dir=>readdirSync(dir).filter(file=>file.endsWith('.ts')&&!file.endsWith('.test.ts')&&file!=='utils.ts').map(file=>`${dir}/${file}`));
const compile = (source,file) => ts.transpileModule(source.replaceAll('import.meta.url', "'file:///offline/contract.js'").replaceAll('import.meta.env','({})'), {fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const registry = paths.map(file=>`${JSON.stringify('/'+file.slice(0,-3))}:function(module,exports,require){\n${compile(readFileSync(file,'utf8'),file)}\n}`).join(',\n');
const loader = `const __modules={${registry}};const __cache={};const __require=(name,from='/')=>{const parts=(name.startsWith('.')?from.slice(0,from.lastIndexOf('/')+1)+name:name).split('/');const out=[];for(const part of parts){if(part==='..')out.pop();else if(part!=='.'&&part)out.push(part);}const id='/'+out.join('/').replace(/\\.(js|ts)$/,'');if(__cache[id])return __cache[id].exports;if(!__modules[id])throw Error('Unavailable offline dependency: '+name);const module={exports:{}};__cache[id]=module;__modules[id](module,module.exports,s=>__require(s,id));return module.exports;};\n`;
const worker = loader + "__require('/src/codecs/v2.worker');";
let harness = readFileSync('scripts/offline/browser-harness.js','utf8')
    .replace("const golden = await (await fetch('/tests/fixtures/wire-golden.json')).json();",'const golden = window.__GOLDEN__;')
    .replace("const worker = new Worker('/src/codecs/v2.worker.js', { type: 'module' });", "const blobUrl = URL.createObjectURL(new Blob([window.__WORKER_BUNDLE__], {type:'text/javascript'}));\n    const worker = new Worker(blobUrl, {type:'classic'});")
    .replace('record.terminated++; terminate();','record.terminated++; terminate(); URL.revokeObjectURL(blobUrl);')
    .replace('new worker; main page already warm; worker fetch/cache state not isolated', 'fresh blob worker and fresh model; warm main page/in-memory bundle')
    .replace('Actual Chromium core modules and dedicated workers.', 'Actual Chromium runtime, in-memory core bundle and blob classic workers; not deployed module-worker packaging.');
const entry = `(async()=>{const exports={};const require=s=>__require(s,'/browser-harness');${compile(harness,'browser-harness.js')}})();`;
mkdirSync('.offline-build',{recursive:true});
writeFileSync('.offline-build/browser-memory.js',loader+`window.__WORKER_BUNDLE__=${JSON.stringify(worker)};window.__GOLDEN__=${readFileSync('tests/fixtures/wire-golden.json','utf8')};`+entry);
console.log('Prepared network-free core bundle; no navigation policy changes and no dependency substitution.');
