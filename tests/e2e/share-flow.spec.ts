import { expect, test } from '@playwright/test';
import { e2eDescribe } from './utils';
const writer = process.env.VITE_ENABLE_V2 === 'true' ? 'v2' : 'v1';
e2eDescribe('share flow', () => {
    test.beforeEach(async ({ context }) => {
        // Deterministic clipboard seam for the cross-engine app lifecycle contract.
        // The separate Chromium test below exercises the actual browser clipboard.
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
                writeText: async (text: string) => { localStorage.setItem('test-clipboard', text); },
            } });
        });
    });
    test('should share, copy and restore with the configured writer and actual version badge', async ({ page }) => {
        await page.goto('/v1/');
        const editor = page.getByTestId('editor-content');
        await editor.click();
        await editor.fill('Hello from e2e share flow');
        await page.getByTestId('share-button').click();
        await expect(page).toHaveURL(new RegExp(`/${writer}/#`));
        await expect(page.getByTestId('version-badge')).toHaveText(writer);
        expect(await page.evaluate(() => localStorage.getItem('test-clipboard'))).toBe(page.url());
        const secondPage = await page.context().newPage();
        try {
            await secondPage.goto(page.url());
            await expect(secondPage.getByTestId('editor-content')).toHaveText('Hello from e2e share flow');
            await expect(secondPage.getByTestId('version-badge')).toHaveText(writer);
        } finally {
            await secondPage.close();
        }
    });
    test('should leave the URL unchanged on clipboard failure and allow retry', async ({ page }) => {
        await page.goto('/v1/');
        await page.getByTestId('editor-content').fill('Retry after denied clipboard.');
        await page.evaluate(() => {
            navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied for test'); };
        });
        await page.getByTestId('share-button').click();
        await expect(page.getByText('Clipboard denied for test')).toBeVisible();
        await expect(page).toHaveURL(/\/v1\/$/);
        await expect(page.getByTestId('share-button')).toBeEnabled();
        await page.evaluate(() => {
            navigator.clipboard.writeText = async (text: string) => { localStorage.setItem('test-clipboard', text); };
        });
        await page.getByTestId('share-button').click();
        await expect(page).toHaveURL(new RegExp(`/${writer}/#`));
    });
    test('should hold the requested snapshot and disable duplicate submission while preparing', async ({ page }) => {
        await page.goto('/v1/');
        const editor = page.getByTestId('editor-content');
        await editor.fill('Requested snapshot.');
        await page.evaluate(() => {
            navigator.clipboard.writeText = async (text: string) => {
                localStorage.setItem('test-clipboard', text);
                await new Promise<void>(resolve => { (window as unknown as { finishCopy: () => void }).finishCopy = resolve; });
            };
        });
        await page.getByTestId('share-button').click();
        await expect(page.getByTestId('share-button')).toBeDisabled();
        await expect(page.getByTestId('share-button')).toHaveAttribute('aria-busy', 'true');
        await editor.fill('Later editor changes.');
        await page.waitForFunction(() => 'finishCopy' in window);
        await page.evaluate(() => (window as unknown as { finishCopy: () => void }).finishCopy());
        await expect(page).toHaveURL(new RegExp(`/${writer}/#`));
        const copy = await page.context().newPage();
        try {
            await copy.goto(page.url());
            await expect(copy.getByTestId('editor-content')).toHaveText('Requested snapshot.');
        } finally {
            await copy.close();
        }
    });
});
e2eDescribe('real clipboard', () => {
    test('should write a real Chromium clipboard share URL', async ({ page, context, browserName }) => {
        test.skip(browserName !== 'chromium', 'Clipboard permission automation is Chromium-specific; other engines use the lifecycle seam.');
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto('/v1/');
        await page.getByTestId('editor-content').fill('Actual clipboard.');
        await page.getByTestId('share-button').click();
        await expect(page).toHaveURL(new RegExp(`/${writer}/#`));
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
    });
});
