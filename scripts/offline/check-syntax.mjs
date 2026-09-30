// Supplemental syntax diagnostics only; NOT a replacement for the project build.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_PATH || '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const files = [];
const walk = directory => {
    for (const item of readdirSync(directory, {withFileTypes:true})) {
        const path = `${directory}/${item.name}`;
        if (item.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(path) && !path.endsWith('.d.ts')) files.push(path);
    }
};
for (const directory of ['src','scripts/compression','scripts/offline','tests']) walk(directory);
let failures = 0;
for (const file of files) {
    const result = ts.transpileModule(readFileSync(file,'utf8'), {fileName:file,reportDiagnostics:true,
        compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
    for (const diagnostic of result.diagnostics ?? []) {
        failures++;
        console.error(file, ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n'));
    }
}
console.log(`Syntax-only TypeScript ${ts.version}: ${files.length} files, ${failures} diagnostics. No dependency resolution or app type check.`);
process.exitCode = failures ? 1 : 0;
