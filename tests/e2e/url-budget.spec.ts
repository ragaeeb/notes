import { expect, test } from '@playwright/test';
import { e2eDescribe } from './utils';

e2eDescribe('url budget', () => {
    test('should display budget transitions and warning dialog', async ({ page }) => {
        await page.goto('/v1/');

        await expect(page.getByText('0%')).toBeVisible();

        await page.goto(`/v1/?budget=1#${'a'.repeat(40000)}`);
        await expect(page.getByText('61%')).toBeVisible();

        const yellowBar = page.getByTestId('limit-indicator-bar');
        await expect(yellowBar).toHaveClass(/bg-amber-400/);

        await page.goto(`/v1/?budget=2#${'a'.repeat(63000)}`);

        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByText('URL Near Limit')).toBeVisible();
    });
});
