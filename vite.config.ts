import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
    version?: string;
};

const appVersion = process.env.npm_package_version ?? packageJson.version ?? '0.0.0';

export default defineConfig({
    build: { assetsInlineLimit: 0, target: 'esnext' },
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    optimizeDeps: { exclude: ['brotli-wasm'] },
    plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } }), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
