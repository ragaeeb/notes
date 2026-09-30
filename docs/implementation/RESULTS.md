# Measurements and acceptance status

## Release decision

**Implemented, but not production-qualified. Default writer remains v1; CM emission remains disabled.** The delivery contains the v2 pipeline, worker/UI integration, fixed wire fixtures, regression/fuzz contracts, benchmark tooling and local qualification switches. Missing app dependencies/Bun and restricted browser navigation prevent the full build/WASM/app/device gates from being certified. No deployment or remote write was performed.

All numeric results below come from saved raw reports in `evidence/`. The original study/review numbers were not reused as new measurements. Node's native Brotli is real compression, not the installed browser WASM backend. The supplemental states are not presented as the original 39 Lexical-exported states.

## Executed checks

| Check | Observed result | Scope / limitations |
|---|---|---|
| Isolated public wire + worker lifecycle contracts | 389 passed, 0 failed, 2 skipped | Node 22.16.0; native Brotli 1.1.0 and real native deflate; two original v1 Brotli/WASM links skipped |
| Chromium core/worker contracts | 372 passed, 0 failed, 29 skipped | Chromium 144.0.7559.96; in-memory core wrappers and actual classic blob workers; no installed Brotli WASM |
| Deflate differential + CM prototype regression | 2,677 passed | Real zlib stored/fixed/dynamic outputs, four strategies, four levels, 14 lengths up to 2 MiB; trailing/truncation/output-limit probes |
| CM model allocation accounting | Passed | 11,565,075 dynamically allocated model-array bytes plus 16,384 fixed module-table bytes = 11,581,459; independently instrumented constructors |
| Core strict type check | Passed, 21 production files | Installed TypeScript 5.8.3 with explicitly minimal lexical/brotli declarations; NOT full project TS 7/build acceptance |
| Syntax diagnostics | Passed, 66 files | Source, contracts, added scripts/E2E tests; no dependency/type-resolution guarantee |
| Full Bun tests, installed-WASM verification, fixture export, build, Biome, app Playwright | BLOCKED, exit 127 | Actual attempted commands saved in `project-gates-blocked.json`; Bun/bunx unavailable |

The reports include their individual cases, runtimes, fixture/corpus hashes and process memory fields. `native-wire-contract-before-deflate-fix.json` deliberately preserves the initial 388-pass/1-fail/2-skip run. `chromium-module-worker-policy-failure.json` deliberately preserves the unsuccessful opaque-origin module-worker attempt. These are diagnostic history, not final passes.

The original prototype silently changed a 36-byte sentence when its 28-byte frame was truncated by one byte. The failing probe is reproduced in `native-framing-differential.json`; the new empty-prime frame is 35 bytes and rejects every truncated prefix. The public primed-CM tests additionally reject per-byte bit flips, oversized/minimal-length violations, bad termination, trailing data and CRC mismatches. CRC is accidental-corruption detection, not authentication.

There are 111 immutable wire specimens: 104 v2 binary cases (56 text and 48 rich), three literal cases and four v1 cases. They were frozen before assertions. They are generated compatibility specimens, not claims of previously issued historical links. Node and Chromium reproduce the CM bytes. **Both are V8-family runtimes; JavaScriptCore/SpiderMonkey/Bun equality remains unverified.**

## Dataset provenance and comparison contract

`compression:fixtures` is the installed-dependency exporter for the original 14 fixtures, eight follow-ups and 17 technical variants, plus 10 new evaluation inputs. It preserves source bytes, hashes source/AST/code-unit representations, uses normal Lexical export, checks the 39-development count and refuses silent omission/overwrite. README/AGENTS/CHANGELOG inputs are baseline copies so later documentation edits cannot contaminate the comparison. It has not run here: the relevant Lexical/package README dependencies are unavailable. No result is claimed for the complete original 39-state suite.

The executed native suite has **22 supplemental development states**: 18 historical plain-text contents reconstructed using frozen defaults, two manually specified rich/style states, an empty-root escape and an alias-collision escape. It has **10 separately authored evaluation states**: eight plain/Unicode/content cases and two manually authored rich ASTs. These are not externally collected, blinded or real-Lexical-exported evaluation data. They were authored/frozen before policy selection and then scored without retuning. The evaluation set is now used; future tuning needs a new holdout.

The native baseline uses the unchanged v1 transform/header semantics with the same native Brotli q11 backend as the comparison. It is labeled **v1-equivalent native**, not the unchanged browser/WASM encoder. The installed-WASM benchmark path instead calls the unchanged public v1 encoder and decoder directly. Baseline eligibility requires exact reconstruction: the alias-collision example is ineligible rather than being rewarded for losing data.

Every admitted candidate in these sweeps was decoded to the original canonical state. Selection matched the shortest successfully completed admissible fragment, with stable tie-breaking. All tag, Unicode, length, CRC and termination bytes are included. Full URLs below use the production origin, adding 29 characters. Percent savings on fragments and full URLs are not interchangeable.

## Unified sweeps

| Sweep | States | Repeats per state | Valid candidate records | Candidate failures / round-trip / selector / eligible-v1 growth failures |
|---|---:|---:|---:|---|
| Native development, exhaustive | 22 | 1 | 2,193 | 0 / 0 / 0 / 0 |
| Native evaluation, exhaustive | 10 | 1 | 1,031 | 0 / 0 / 0 / 0 |
| Native development, shipping schedule | 22 | 3 | 1,986 | 0 / 0 / 0 / 0 |
| Native evaluation, shipping schedule | 10 | 3 | 927 | 0 / 0 / 0 / 0 |

The frozen native shipping policy retained the exhaustive winner's length on all 96 shipping runs (32 states × three repeats). This does not promise a global optimum for unseen documents, a different runtime or a deadline that stops before the same candidates finish. The policy source and development-evidence SHA-256 values are preserved in `policy-freeze.json` and still match their frozen files.

### Development complete fragment and URL sizes

The ordinary column is the exhaustive minimum without CM, not a separate historical experiment. The full-URL column is the final combined result. All columns include their own framing. The v1 column is native v1-equivalent as defined above.

| Fixture | V1 fragment | Best ordinary fragment | Combined v2 fragment | V2 full URL | Fragment reduction vs eligible v1 |
|---|---:|---:|---:|---:|---:|
| Empty | 88 | 1 | 1 | 30 | 98.9% |
| Two characters | 111 | 3 | 3 | 32 | 97.3% |
| Short English | 111 | 12 | 12 | 41 | 89.2% |
| Task note | 140 | 56 | 40 | 69 | 71.4% |
| Whitespace and escapes | 164 | 65 | 45 | 74 | 72.6% |
| Five prose paragraphs | 543 | 455 | 375 | 404 | 30.9% |
| Arabic | 282 | 144 | 111 | 140 | 60.6% |
| Emoji and mixed Unicode | 268 | 183 | 131 | 160 | 51.1% |
| README plain | 3228 | 2912 | 2631 | 2660 | 18.5% |
| 100 varied paragraphs | 5950 | 5789 | 5789 | 5818 | 2.7% |
| 100 unique tokens | 5111 | 4871 | 4871 | 4900 | 4.7% |
| Follow-up Arabic | 228 | 108 | 73 | 102 | 68.0% |
| Cyrillic | 219 | 103 | 103 | 132 | 53.0% |
| Japanese | 218 | 115 | 115 | 144 | 47.2% |
| Hebrew | 187 | 83 | 83 | 112 | 55.6% |
| Escapes and controls | 180 | 51 | 51 | 80 | 71.7% |
| Unicode extremes | 179 | 73 | 73 | 102 | 59.2% |
| Unpaired surrogates | 135 | 37 | 35 | 64 | 74.1% |
| Frozen v2 rich grammar specimen | 398 | 212 | 135 | 164 | 66.1% |
| Rich grammar with style and RTL metadata | 458 | 341 | 225 | 254 | 50.9% |
| Empty root is not an empty paragraph | 40 | 4 | 4 | 33 | 90.0% |
| Unknown field and alias collision | ineligible | 112 | 81 | 110 | ineligible |

`Hello world` is 12 fragment / 41 full-URL characters; the native baseline is 111 / 140. The task note is 40 / 69 versus 140 / 169. Those are **89.2% and 71.4% fragment reductions**, respectively, but **70.7% and 59.2% full-URL reductions**. They are not the old study's protocol or WASM numbers. The 100-unique-token winner is split-text UTF-8 Brotli q4, not CM. Its relatively modest gain is retained rather than excluded.

### Evaluation complete sizes (frozen policy; no post-score tuning)

| Fixture | V1 fragment | Best ordinary fragment | Combined v2 fragment | V2 full URL |
|---|---:|---:|---:|---:|
| Community pantry instructions | 282 | 200 | 133 | 162 |
| Arabic museum reminder | 302 | 157 | 125 | 154 |
| Japanese seed exchange | 279 | 171 | 169 | 198 |
| German workshop | 280 | 175 | 147 | 176 |
| Mixed codepoint identities | 302 | 204 | 165 | 194 |
| Reading log rich | 310 | 167 | 128 | 157 |
| Configuration review rich | 358 | 192 | 152 | 181 |
| Blank paragraph identities | 150 | 51 | 35 | 64 |
| Small inventory | 199 | 107 | 83 | 112 |
| Unpaired code units | 158 | 87 | 57 | 86 |

The exhaustive ordinary minima can be smaller than ordinary minima under the pruned schedule; all per-candidate values are retained. For example, pruning can forgo an ordinary rich-document win even when CM later supplies the overall winner. Therefore disabling CM does not imply the pruned ordinary schedule finds every exhaustive ordinary minimum.

## Latency and memory

Shipping-schedule timings below include representation work and sequential candidate validation in a single native process, **not worker startup, UI, clipboard, app bundles or real-mobile behavior**. Each state ran three times. Processes were resumed in batches after terminal execution limits; cold/JIT/cache state was not isolated. The JSON `processPeakRssKiB` is the last batch only, not a peak across all resumed runs. The first exhaustive development report's older generic memory wording is superseded here, without changing its hash or measurements.

| Native shipping set | Samples | Median encode/search | Maximum | Samples above 500 ms target |
|---|---:|---:|---:|---:|
| Development | 66 | 168.0 ms | 804.0 ms | 4 |
| Evaluation | 30 | 169.5 ms | 415.6 ms | 0 |

Four development runs exceeded the 500 ms target; the maximum was 804.0 ms. The target is checked between candidates and is not a preemptive per-candidate deadline. The separate worker deadline is two seconds. Exhaustive offline runs deliberately ignore that deadline and took up to 8,224.4 ms on development; they are search diagnostics, not shipping latency claims.

Actual Chromium classic-blob-worker share/load on the task note ran six times. Encode including fresh worker startup ranged **213.2–248.0 ms**; decode ranged **117.6–140.9 ms**. Each worker had a fresh model; the main page/bundle was already warm. These are not cold deployed network/WASM measurements. The responsiveness probe recorded 40 main-thread timer ticks and a maximum gap of 18.9 ms. Workers were terminated and Chromium was closed after the run.

The core Chromium run sampled a peak **780,484,608 bytes (744.3 MiB) summed process RSS**, including main-page contract work and shared pages counted in multiple processes. It is neither PSS/private memory nor isolated worker/app peak memory. Native wire verification's peak process RSS was 293,224 KiB. Neither number replaces the missing real-app/device memory qualification. The 11,581,459-byte model-array bound is a different, instrumented quantity; it must not be substituted for these costs.

Managed browser policy blocks all URL navigation, including localhost. No policy was changed. The working browser harness uses `about:blank`, local module wrappers and classic blob workers. A deployed module worker, SPA redirects, Vite/WASM asset packaging, React, Lexical, actual browser clipboard and complete app share/load were **not verified** here. The Playwright app tests for those paths are included but unexecuted.

## Corpus and dictionary challengers

The development-only challenger measured **560 candidates** (140 per variant) across the same 22 supplemental states: the original prime, 30 KiB synthetic augmentation, 60 KiB synthetic augmentation, and a 32 KiB preset dictionary with native deflate level 9. Each candidate charges a proposed one-character tag and the complete length/checksum/arithmetic termination frame where applicable. Every body was decoded and reconstructed before counting it.

**None of the variants had a unique win over the combined exhaustive pipeline.** No larger prime or browser dictionary dependency was adopted. The larger primes frequently increase both startup work and fragment size. Candidate-level timings, representation bytes, model-array counts, hashes and full framed lengths are in `native-challengers-development.json`.

Important limitations: the larger assets are deterministic, independently authored **synthetic technical augmentation** of the original corpus, not 30/60 KiB of independently collected natural prose. Only UTF-8 bodies were compared in this challenger. Dictionary timing uses native zlib with no browser decoder/startup cost; proposed tag `4` is reserved and these are not valid issued links. The model/policy had already been frozen provisionally before evaluation; subsequent challenger scores caused no model or schedule change. This does not exhaust all possible corpora/dictionaries or complete mobile corpus qualification.

## Reproduction

Run from the code root. The application commands require its declared Bun/dependencies; use Bun, not npm/yarn.

```bash
bun install --frozen-lockfile
bun run compression:fixtures
bun run compression:verify
bun run compression:benchmark --set=development
bun run compression:benchmark --set=development --shipping
# Freeze reviewed model/policy inputs BEFORE scoring a fresh evaluation set.
bun run compression:benchmark --set=evaluation --shipping
bun run compression:benchmark --set=evaluation
bun test
bun run build
bunx biome check src
bun run compression:qualify
```

Supplemental commands used here (installed TypeScript path can be set with `TYPESCRIPT_PATH`):

```bash
node scripts/offline/check-types.mjs
node scripts/offline/check-syntax.mjs
node --no-warnings --loader ./scripts/offline/ts-loader.mjs scripts/compression/verify-wire.ts --native --out=docs/implementation/evidence/native-wire-contract.json
node --no-warnings --loader ./scripts/offline/ts-loader.mjs scripts/offline/verify-framing.ts
node --no-warnings --loader ./scripts/offline/ts-loader.mjs scripts/offline/verify-model-memory.ts
node --no-warnings --loader ./scripts/offline/ts-loader.mjs scripts/compression/benchmark.ts --native --set=development --shipping --out=/tmp/native-shipping.json
node --no-warnings --loader ./scripts/offline/ts-loader.mjs scripts/compression/challengers.ts --out=/tmp/native-challengers.json
node scripts/offline/bundle-browser.mjs
python scripts/offline/browser-check.py
```

For long benchmark invocations, use `--limit=4`, then repeat with `--resume --limit=4`. A report with `status: in-progress` is not a completed suite. Resume verifies input hashes/profile; it does not reconstruct cold-start measurements or prevent a caller from modifying code between runs. The delivered manifest records the final source tree. Choose fresh output paths to retain original evidence.

## Still required before activation

Installed-WASM old/new links and bounded streaming; the exact 39 original Lexical exports and their full baseline comparison; a fresh evaluation set for any further tuning; Biome and the complete project build/test suite; actual Vite module-worker/WASM packaging; app share/load, clipboard, empty links, navigation, errors, badges and budget warnings; Safari/Firefox engine equality; desktop and **real mobile** cold/warm latency, worker/app memory and UI responsiveness; final enabled-tag/model/policy review. Desktop browser emulation is not a real-mobile substitute. See `HANDOFF.md` for the application and drift workflow.
