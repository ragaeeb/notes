// Requires installed project dependencies. Fail closed rather than omit any of 39 cases.
// Run once and review/commit the output BEFORE model/scheduling selection.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { $convertFromMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical';
import { developmentSources, evaluationSources, type SourceFixture } from './fixtures';
const sha = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const output = process.argv[2] ?? 'docs/implementation/fixtures/lexical-export.json';
assert(!existsSync(output) || process.env.REPLACE_FIXTURES === 'reviewed', 'Refusing to overwrite frozen inputs; set REPLACE_FIXTURES=reviewed after review.');
const sourceRows = developmentSources();
const technicalFiles = [
    ['AGENTS', 'docs/implementation/fixtures/source/AGENTS.md'],
    ['CHANGELOG', 'docs/implementation/fixtures/source/CHANGELOG.md'],
    ['lexical', 'node_modules/lexical/README.md'], ['react', 'node_modules/react/README.md'],
    ['brotli-wasm', 'node_modules/brotli-wasm/README.md'], ['happy-dom', 'node_modules/happy-dom/README.md'],
];
const sourceHashes: Record<string, string> = {};
for (const [name, path] of technicalFiles) {
    const bytes = readFileSync(path); // Missing dependencies are an ERROR, not a smaller dataset.
    sourceHashes[path] = sha(bytes);
    const text = bytes.toString('utf8').replaceAll('\r', ''); // Original experiment's explicit source normalization.
    const technical: [string, SourceFixture['kind'], string][] = [
        [`${name} plain`, 'plain', text.trimEnd()], [`${name} rich`, 'markdown', text],
    ];
    const paragraph = text.split('\n').map(line => line.trim()).find(line => line.length > 60 && /^[A-Za-z]/.test(line));
    if (paragraph) technical.push([`${name} paragraph`, 'plain', paragraph]);
    for (const [label, kind, content] of technical) sourceRows.push({ id: `technical-${sourceRows.length - 21}`, name: label, set: 'development', kind, text: content });
}
assert.equal(sourceRows.length, 39, 'The original 14 + 8 + 17 fixtures changed. Review source versions; do not silently relabel a changed set.');
const states = [...sourceRows, ...evaluationSources()].map(source => {
    const editor = createEditor({ namespace: 'frozen-compression-fixture',
        nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, CodeHighlightNode],
        onError: error => { throw error; } });
    editor.update(() => {
        if (source.kind === 'plain') {
            for (const line of source.text.split('\n')) $getRoot().append($createParagraphNode().append($createTextNode(line)));
        } else {
            $convertFromMarkdownString(source.text, TRANSFORMERS);
            if (source.kind === 'styled') $getRoot().append($createParagraphNode().setDirection('rtl').setFormat('right').setIndent(2)
                .append($createTextNode('Styled content').setStyle('color: red; font-size: 20px;').setFormat(3)));
        }
    }, { discrete: true });
    const state = JSON.parse(JSON.stringify(editor.getEditorState().toJSON()));
    return { ...source, textSha256: sha(Buffer.from(source.text, 'utf8')), textCodeUnitsSha256: sha(Buffer.from(source.text, 'utf16le')),
        stateSha256: sha(JSON.stringify(state)), state };
});
const directory = output.slice(0, output.lastIndexOf('/'));
if (directory) mkdirSync(directory, { recursive: true });
writeFileSync(output, `${JSON.stringify({ format: 1, provenance: 'Actual installed Lexical headless export; no codec reconstruction',
    runtime: process.versions, lockSha256: sha(readFileSync('bun.lock')), packageSha256: sha(readFileSync('package.json')),
    evaluationSourceSha256: sha(readFileSync('tests/fixtures/evaluation-sources.json')), sourceHashes, fixtures: states }, null, 2)}\n`);
console.log(`Exported ${states.length} immutable input states to ${output}; review the manifest before measuring.`);
