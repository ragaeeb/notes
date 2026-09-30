import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_PATH || '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const paths = ['src/codecs', 'src/lib'].flatMap(dir => readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'utils.ts').map(f => `${dir}/${f}`));
const program = ts.createProgram([...paths, 'scripts/offline/types.d.ts'], {
    noEmit: true, strict: true, noUnusedLocals: true, noUnusedParameters: true,
    erasableSyntaxOnly: true, verbatimModuleSyntax: true, noFallthroughCasesInSwitch: true, noUncheckedSideEffectImports: true,
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'], types: [],
});
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(`Offline core-only typecheck: TypeScript ${ts.version}; ${paths.length} production files; minimal lexical/brotli type declarations, not a project build.`);
for (const d of diagnostics) console.log(ts.flattenDiagnosticMessageText(d.messageText, '\n'), d.file ? `${d.file.fileName}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}` : '');
process.exitCode = diagnostics.length ? 1 : 0;
