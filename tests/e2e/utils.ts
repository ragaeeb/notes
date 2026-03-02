import { test } from '@playwright/test';

type E2EDescribe = (title: string, callback: () => void) => void;

export const e2eDescribe: E2EDescribe = process.env.RUN_E2E === 'true' ? test.describe.bind(test) : () => {};
