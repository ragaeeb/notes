// Offline transpilation for a core-only browser harness. NOT a Vite build or app bundle.
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_PATH || '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root = '.offline-build';
const files = ['src/codecs', 'src/lib', 'tests/contract'].flatMap(dir => readdirSync(dir).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'utils.ts').map(name => `${dir}/${name}`));
for (const file of files) {
    let output = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    output = output.replace(/(from\s*|import\s*\()(['"])(\.[^'"]+)\2/g, (match, prefix, quote, specifier) => `${prefix}${quote}${specifier.endsWith('.ts') ? specifier.slice(0,-3)+'.js' : /\.[a-z]+$/i.test(specifier) ? specifier : specifier+'.js'}${quote}`);
    output = output.replace("new URL('./v2.worker.ts', import.meta.url)", "new URL('./v2.worker.js', import.meta.url)");
    const destination = path.join(root, file.replace(/\.ts$/, '.js'));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, output);
}
mkdirSync(`${root}/tests/fixtures`, {recursive:true});
cpSync('tests/fixtures/wire-golden.json', `${root}/tests/fixtures/wire-golden.json`);
cpSync('scripts/offline/browser-harness.js', `${root}/browser-harness.js`);
writeFileSync(`${root}/index.html`, '<!doctype html><meta charset="utf-8"><title>Offline core qualification</title><h1>Compression core — Chromium qualification</h1><p>This is not the React application or a Vite production build.</p><pre id="result">Running real browser contracts…</pre><script type="module" src="/browser-harness.js"></script>');
console.log(`Transpiled ${files.length} core/contract files with TypeScript ${ts.version}. Brotli WASM is intentionally not substituted.`);
