import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { e2eDescribe } from './utils';
const golden = JSON.parse(readFileSync('tests/fixtures/wire-golden.json', 'utf8'));
e2eDescribe('permanent versioned readers', () => {
    test('should load explicit empty v2 and retain its version', async ({ page }) => {
        await page.goto('/v2/#.');
        await expect(page.getByTestId('editor-content')).toBeEmpty();
        await expect(page.getByTestId('version-badge')).toHaveText('v2');
        await expect(page.getByText('Encoded: 1 chars')).toBeVisible();
    });
    for (const version of ['v1', 'v2']) {
        test(`should read immutable ${version} real-compressor fixtures`, async ({ page }) => {
            const entries = golden.entries.filter((entry: { version: string; compression?: string; mode?: { compression: string } }) =>
                entry.version === version && (version === 'v1' || entry.mode?.compression === 'cm'));
            for (const entry of entries) {
                await page.goto(`/${version}/#${entry.fragment}`);
                await expect(page.getByTestId('editor-content')).toBeVisible();
                await expect(page.getByTestId('editor-content')).not.toBeEmpty();
                await expect(page.getByTestId('version-badge')).toHaveText(version);
                await expect(page.getByText(/corrupted|checksum mismatch|Unable to process/)).toHaveCount(0);
            }
        });
    }
    test('should recover after a corrupt link and refresh the URL budget on navigation', async ({ page }) => {
        await page.goto('/v2/#Q*');
        await expect(page.getByText('Invalid base64url body.')).toBeVisible();
        await page.evaluate(() => { location.hash = '.Recovered'; });
        await expect(page.getByTestId('editor-content')).toHaveText('Recovered');
        await expect(page.getByText('Encoded: 10 chars')).toBeVisible();
        await page.evaluate(() => {
            history.pushState(null, '', '/v1/');
            dispatchEvent(new PopStateEvent('popstate'));
        });
        await expect(page.getByTestId('editor-content')).toBeEmpty();
        await expect(page.getByText(/^Encoded:/)).toHaveCount(0);
    });
    test('should warn for the actual serialized fragment budget', async ({ page }) => {
        const fragment = '.'.padEnd(63_000, 'a');
        await page.goto(`/v2/#${fragment}`);
        await expect(page.getByRole('heading', { name: 'URL Near Limit' })).toBeVisible();
    });
});
