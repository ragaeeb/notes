# notes.ilmtest.io

![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)
![Biome](https://img.shields.io/badge/Biome-60a5fa?style=flat&logo=biome&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-F38020?style=flat&logo=cloudflare&logoColor=white)
[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/af30ae2a-69f3-4790-a110-b0567101f9b8.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/af30ae2a-69f3-4790-a110-b0567101f9b8)
[![codecov](https://codecov.io/gh/ragaeeb/notes/graph/badge.svg?token=QJLSB4ZPGO)](https://codecov.io/gh/ragaeeb/notes)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/ragaeeb/notes?utm_source=oss&utm_medium=github&utm_campaign=ragaeeb%2Fnotes&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

Zero-backend document sharing app. The entire document is stored in the URL fragment (`#...`).

## Features

- Rich text editing with Lexical
- Instant sharing via URL fragment
- No backend, no auth, no database
- Permanent v1 and v2 readers (`/v1/`, `/v2/`); qualification-gated v2 writer
- URL budget indicator with warning threshold
- Dark-mode-first UI

## How It Works

URL is the storage layer. The existing v1 format below uses a 3-byte header. The implemented v2 format uses a one-character tag and exact-losslessness candidate selection; production activation is gated as described below.

**Encode path:**

```
Lexical state → strip defaults → key minification → value minification
  → JSON → Brotli q11 (fallback: deflate-raw) → 3-byte header + compressed → base64url → /v1/#...
```

**Decode path:**

```
/v1/#... → base64url → read header → decompress → JSON parse
  → expand values → expand keys → restore defaults → Lexical state
```

Codec version is in the path. Decoder support for existing versions must stay forever.

### Payload Header

| Byte | Purpose | Values |
|------|---------|--------|
| 0 | Format version | `0x01` |
| 1 | Compressor | `0x00` deflate-raw, `0x01` Brotli |
| 2 | Repr flags | `0x00` Lexical JSON |

### Pre-compression Transforms

- **Default stripping**: Node-type-aware removal of Lexical default values (e.g. `version: 1`, `indent: 0`, `format: ''`)
- **Key minification**: `children` → `c`, `direction` → `d`, etc.
- **Value minification**: `paragraph` → `p`, `ltr` → `L`, etc. (scoped to specific keys to avoid user-text collisions)

## Payload Limits

The UI's 65,536-character **fragment** budget and 95% warning are heuristics, not a guarantee about every browser, device, messaging app or total URL length. No word-count capacity is promised. Actual limits depend on the content, origin and receiving software.

Decoded representation and reconstructed document JSON are limited to 2 MiB, with additional nesting/container limits. CM additionally limits its representation to 128 KiB and model arrays to 16 MiB. A dedicated worker enforces a two-second request deadline; the normal-work target is 500 ms, not a measured mobile guarantee.

## V2 implementation and qualification

`/v2/#<tag><body>` selects among full JSON, v1-equivalent JSON, exact plain text, compact objects, positional tuples, split text and version-owned Markdown. Candidates use raw bytes, native deflate, Brotli or integrity-framed context mixing. Unicode-window encoding is considered where useful. Only results that reconstruct the complete original serialized state are admitted. `Hello world` can be `/v2/#.Hello~world`; `.` represents an explicit empty paragraph.

**This delivery is not production-qualified.** Both readers are wired in, but the default writer remains v1 and CM emission remains disabled. Native/Chromium-core results do not replace the missing installed-WASM, React/Vite, Safari/Firefox and real-mobile gates. See [HANDOFF.md](HANDOFF.md), the [wire contract](docs/implementation/WIRE.md), [results](docs/implementation/RESULTS.md) and [ledger](docs/implementation/LEDGER.md).

For local qualification only:

```bash
VITE_ENABLE_V2=true VITE_ENABLE_CM_EXPERIMENTAL=true bun dev
bun run compression:fixtures
bun run compression:verify
bun run compression:benchmark --set=development
bun run compression:benchmark --set=development --shipping
bun run compression:qualify
```

Freeze reviewed fixture/model/policy manifests before scoring a **new** untouched evaluation set. The supplied evaluation set has now been scored; do not retune on it while still calling it untouched. The baseline studies' 14 + 8 + 17 real Lexical exports require installed dependencies. Supplemental native fixtures are explicitly not those 39 exported ASTs.

Existing decoder meanings must remain available permanently. Do not change assigned v2 tags, parser rules, model/corpus bytes, or restoration defaults to accommodate an encoder optimization. Keep the editor's full normal `toJSON()` export. Do not deploy merely because the opt-in flags exist.

## Getting Started

```bash
bun install
bun dev
```

## Testing

```bash
bun test
bun test --coverage
bun run test:e2e
```

## CI/CD

GitHub Actions are split by responsibility:

- `.github/workflows/build.yml`: CI only (build + unit/integration tests + lcov upload to Codecov)
- `.github/workflows/release.yml`: Semantic Release only (versioning, changelog, GitHub release)
- `.github/workflows/deploy.yml`: Cloudflare Pages deploy only (build + `wrangler pages deploy`)

## Deployment

### Option A: Cloudflare Pages via Wrangler CLI (recommended fallback)

If Git integration is unavailable/broken, deploy directly from local `dist/`:

```bash
# one-time auth
bunx wrangler login

# one-time project creation (skip if it already exists)
bunx wrangler pages project create notes

# build + deploy
bun run build
bunx wrangler pages deploy dist --project-name=notes
```

Then in Cloudflare Dashboard:

1. Open your Pages project (`notes`)
2. Go to **Custom domains**
3. Add `notes.ilmtest.io`

### Option B: Git-integrated Pages deploy

If Git integration is working:

1. Connect repo in Cloudflare Pages
2. Build command: `bun run build`
3. Output directory: `dist`
4. Keep SPA routing via `public/_redirects`

### GitHub Actions deploy secrets (for `.github/workflows/deploy.yml`)

Set these in GitHub: **Repo Settings -> Secrets and variables -> Actions -> New repository secret**

1. `CLOUDFLARE_API_TOKEN`
   - Cloudflare Dashboard -> **My Profile** -> **API Tokens** -> **Create Token** -> **Use template** -> **Edit Cloudflare Workers**
   - On the token form, use these values:
     - **Permissions**: keep the template defaults (do not remove entries)
     - **Account Resources**: `Include` -> select the account that owns the `notes` Pages project
     - **Zone Resources**: `Include` -> `All zones` (or select only `ilmtest.io`)
     - **Client IP Address Filtering**: leave empty
     - **TTL**: no expiry (recommended for CI), or set an expiry if your team rotates tokens
   - Click **Continue to summary** -> **Create Token**
   - Copy the token immediately and save it as GitHub secret `CLOUDFLARE_API_TOKEN`
2. `CLOUDFLARE_ACCOUNT_ID`
   - Cloudflare Dashboard -> right sidebar under **Account ID** (for the same account selected above)
   - Or run `bunx wrangler whoami` after `bunx wrangler login` and copy the account ID
   - Save it as GitHub secret `CLOUDFLARE_ACCOUNT_ID`

Workflow command is:

```bash
bunx wrangler pages deploy dist --project-name=notes
```

## Credits

Inspired by [inkash](https://github.com/taqui-786/inkash) by taqui-786.

## License

MIT
