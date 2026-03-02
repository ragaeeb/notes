import { expect, test } from '@playwright/test';

test('should share and restore content via /v1/# URL', async ({ browser, page }) => {
    await page.goto('/v1/');

    const editor = page.getByTestId('editor-content');
    await editor.click();
    await editor.fill('Hello from e2e share flow');

    await page.getByTestId('share-button').click();

    await expect(page).toHaveURL(/\/v1\/#/);

    const sharedUrl = page.url();
    const secondPage = await browser.newPage();
    await secondPage.goto(sharedUrl);

    await expect(secondPage.getByText('Hello from e2e share flow')).toBeVisible();

    await secondPage.close();
});
