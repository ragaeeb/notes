// Offline validation only. Uses an installed TypeScript compiler; no app dependency substitutions.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_PATH || '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
export async function resolve(specifier, context, nextResolve) {
    try { return await nextResolve(specifier, context); }
    catch (error) {
        if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
            for (const suffix of ['.ts', '/index.ts']) {
                try { return await nextResolve(specifier + suffix, context); } catch { /* next */ }
            }
        }
        throw error;
    }
}
export async function load(url, context, nextLoad) {
    if (url.endsWith('.ts') || url.endsWith('.tsx')) {
        const source = await readFile(fileURLToPath(url), 'utf8');
        return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
                jsx: ts.JsxEmit.ReactJSX, useDefineForClassFields: true },
            fileName: fileURLToPath(url),
        }).outputText };
    }
    return nextLoad(url, context);
}
