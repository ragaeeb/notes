# AGENTS.md — AI Agent Guide for notes

## Overview

Zero-backend document sharing app. Entire document stored in URL fragment. No server, no DB, no auth.

## Package Manager

Bun 1.3.10. Always use `bun`, never `npm` or `yarn`.

- Install: `bun install`
- Add package: `bun add <pkg>`
- Add dev dependency: `bun add -d <pkg>`
- Run scripts: `bun run <script>`

## Running the App

- Dev: `bun dev`
- Build: `bun run build`
- Preview: `bun run preview`

## Testing

- All tests: `bun test`
- Coverage: `bun test --coverage`
- Single file: `bun test src/codecs/base64url.test.ts`
- E2E: `bun run test:e2e`
- Framework: `bun:test`
- DOM environment: `happy-dom` via `bunfig.toml`
- Test files are adjacent to source files. E2E tests live in `tests/e2e/`.

## Linting & Formatting

- Biome only
- Check: `bunx biome check src`
- Fix: `bunx biome check --write src`
- Format: `bunx biome format --write src`

## Code Conventions

- Prefer arrow functions over `function`
- Prefer `type` over `interface`
- Tests use `it('should ...')`
- Keep helpers small and named

## Architecture

### Codec versioning

Path declares codec version (`/v1/`, `/v2/`, ...). Never delete old decoders.

### Codec pipeline (v1)

**Encode path:**

Lexical JSON → strip defaults → key minification → value minification → JSON.stringify → Brotli q11 (fallback: deflate-raw) → prepend 3-byte header → base64url → URL fragment

**Decode path:**

URL fragment → base64url decode → read 3-byte header → decompress (Brotli or deflate-raw based on header) → JSON.parse → expand values → expand keys → restore defaults → SerializedEditorState

### 3-byte header

Every encoded payload starts with `[format_version, compressor_id, repr_flags]`:

| Byte | Purpose | Current values |
|------|---------|----------------|
| 0 | Format version | `0x01` |
| 1 | Compressor ID | `0x00` = deflate-raw, `0x01` = Brotli |
| 2 | Repr flags | `0x00` = Lexical JSON |

### Pre-compression transforms

- **Strip/restore defaults**: Node-type-aware. Text nodes (text, code-highlight, tab), element nodes (paragraph, heading, etc.), and bare nodes (linebreak) each have their own default set. Constants in `src/codecs/v1-constants.ts`.
- **Key minification**: Maps long Lexical JSON keys to short aliases (e.g. `children` → `c`). Map in `src/codecs/keymap.ts`.
- **Value minification**: Maps common string values to short aliases on specific minified keys (e.g. `paragraph` → `p` on the `t` key). Map in `src/codecs/v1-constants.ts`.

### Adding a new codec version

1. Add `src/codecs/v2.ts` with `encode` and `decode`.
2. Update `detectVersion()` in `src/codecs/index.ts`.
3. Add decoder case in `decodeFromUrl()`.
4. Point `encodeToUrl()` at latest version.
5. Add `src/codecs/v2.test.ts`.

### WASM loading

Brotli WASM (`brotli-wasm`) is lazy-initialized on first call to `getBrotliIfAvailable()`. Falls back to native `CompressionStream('deflate-raw')` if WASM fails to load.

### Error handling

All codec errors throw `CodecError` (extends `Error`) with user-friendly messages. Hooks surface these via their `error` state.

Decompression bomb guard: payloads exceeding 2 MB decompressed are rejected.

## Key Directories

- `src/codecs/` codec logic, transforms, constants
- `src/lib/` compressor infrastructure and shared helpers
- `src/hooks/` document/load/share hooks
- `src/components/` UI components
- `src/editor/` Lexical editor setup
- `tests/e2e/` Playwright tests

## Key Files

- `src/codecs/v1-constants.ts` — frozen defaults, VALUE_MAP, header constants (append-only)
- `src/codecs/v1-transforms.ts` — stripDefaults, restoreDefaults, minifyValues, expandValues
- `src/codecs/v1.ts` — encode/decode with header + transforms pipeline
- `src/codecs/keymap.ts` — KEY_MAP and key minify/expand functions
- `src/codecs/types.ts` — CodecError, PayloadHeader, CompressorId types
- `src/lib/compression.ts` — Brotli WASM loader and deflate-raw fallback

## Environment Variables

- `__APP_VERSION__` injected by Vite at build time

## Deployment

`main` branch deploys to Cloudflare Pages for `notes.ilmtest.io`.
GitHub deploy workflow uses Wrangler with `--project-name=notes`.
Required GitHub Action secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## CI/CD Workflows

- `.github/workflows/build.yml`: CI only. Runs `bun run build`, `bun test --coverage --coverage-reporter=lcov`, then uploads `coverage/lcov.info` to Codecov.
- `.github/workflows/release.yml`: Release only. Runs semantic-release on `main` to manage version/changelog/release automation.
- `.github/workflows/deploy.yml`: Deploy only. Builds and deploys `dist/` to Cloudflare Pages via Wrangler.
