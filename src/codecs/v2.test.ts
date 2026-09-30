// Wire proof must run outside Bun's global mock.module registry used by other tests.
import { expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('should pass isolated public v1/v2 wire and worker contracts with actual Brotli WASM', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'notes-wire-'));
    try {
        const output = join(directory, 'wire.json');
        const child = Bun.spawn([process.execPath, 'scripts/compression/verify-wire.ts', `--out=${output}`], {
            cwd: process.cwd(),
            stderr: 'pipe',
            stdout: 'pipe',
        });
        const timer = setTimeout(() => child.kill(), 110_000);
        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
        ]).finally(() => clearTimeout(timer));
        expect({ exitCode, stderr: exitCode ? stderr : '', stdout: exitCode ? stdout : '' }).toEqual({
            exitCode: 0,
            stderr: '',
            stdout: '',
        });
        const report = JSON.parse(readFileSync(output, 'utf8'));
        expect(report.summary.fail).toBe(0);
        expect(report.summary.skip).toBe(0);
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
}, 120_000);
