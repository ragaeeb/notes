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
- Versioned codec routing (`/v1/`)
- URL budget indicator with warning threshold
- Dark-mode-first UI

## How It Works

URL is the storage layer. A 3-byte header precedes each compressed payload for forward compatibility.

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

| Browser | Safe Limit | Approx. Max Words |
|---|---|---|
| Chrome/Edge | ~2MB URL | ~120,000 words |
| Firefox | ~65KB encoded | ~39,000 words |
| Safari | ~65KB encoded | ~39,000 words |
| **Cross-browser safe** | **~64KB encoded** | **~38,000 words** |

## Codec Versioning

- `/v1/` is the current codec path.
- Future codecs should be added as `/v2/`, `/v3/`, etc.
- Existing decoders are never removed.

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

## Deployment

Push to `main`:

- CI runs tests and build
- Cloudflare Pages deploy workflow publishes `dist`
- SPA routing is handled by `public/_redirects`

## Credits

Inspired by [inkash](https://github.com/taqui-786/inkash) by taqui-786.

## License

MIT
