# AGENTS.md — AI Agent Guide for notes

## Overview

Zero-backend document sharing app. Entire document stored in URL fragment. No server, no DB, no auth.

## Package Manager

Bun 1.4.2 (`packageManager` / `engines.bun`). Node `>=26` per `engines.node`. Always use `bun`, never `npm` or `yarn`.

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

1. Add a new version module (v2 now exists) with `encode` and `decode`.
2. Update `detectVersion()` in `src/codecs/index.ts`.
3. Add decoder case in `decodeFromUrl()`.
4. Point `encodeToUrl()` at the new version only after its release gates pass.
5. Add isolated public wire tests and immutable goldens for the new version.

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

`notes.ilmtest.io` is Cloudflare Pages project `notes`. There is **no** `.github/workflows/deploy.yml` in this repo; GitHub Actions here only build/test and release.

Deploy paths:
- **Cloudflare Pages Git integration** (preferred when connected): build `bun run build`, output `dist/`, SPA routing via `public/_redirects`.
- **Local Wrangler fallback**: `bun run build && bunx wrangler pages deploy dist --project-name=notes` (after `bunx wrangler login`).

## CI/CD Workflows

- `.github/workflows/build.yml`: CI only. Runs `bun run build`, `bun test --coverage --coverage-reporter=lcov`, then uploads `coverage/lcov.info` to Codecov. Triggers on push/PR to `main`.
- `.github/workflows/release.yml`: Release only. Runs semantic-release on `main` (`push` + `workflow_dispatch`).

## Implemented v2 and current release gate

Both versions decode through one on-demand worker per request. `v2-policy.ts` controls emission only; `v2-constants.ts`, the version-owned parser/representation restore rules and CM model/corpus define permanent meanings.

The default writer is still v1 (`RELEASE_QUALIFIED=false`); CM emission is off (`CM_QUALIFIED=false`). `VITE_ENABLE_V2=true` and `VITE_ENABLE_CM_EXPERIMENTAL=true` are local qualification opt-ins, not passed gates.

New commands: `bun run compression:fixtures`, `bun run compression:verify`, `bun run compression:benchmark --set=development [--shipping]`, and `bun run compression:qualify`. The latter enables local v2/CM and Chromium/Firefox/WebKit Playwright projects. Real mobile acceptance remains separate.

Wire proof runs in its own process because existing unit files globally mock compression modules. `src/codecs/v2.test.ts` launches the same isolated verification and fails if the real installed WASM backend is unavailable. Never regenerate immutable golden fragments inside assertions.

Do not silently mutate corpus, golden or policy manifests. All byte savings include the tag, Unicode metadata, CRC/length/termination framing and URL serialization. Preserve the original research scripts and reviews. Keep v1 files byte-identical. Review Biome autofixes carefully: object construction order can change serialized candidate bytes even when JSON semantics stay equal.
