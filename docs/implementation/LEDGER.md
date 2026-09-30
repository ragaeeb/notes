# Implementation ledger

Baseline: supplied `notes-1.0.0.zip`, extracted without changing its files; Git root commit `c0ae6ee` (full ID in the delivery manifest). This ledger records implementation decisions, verification, and limits. The original studies and reviews are evidence, not shipping measurements.

## 01 — Inspection and baseline

Read `AGENTS.md`, `README.md`, the final compression implementation plan, original study, all six reviews, codec/compressor/hooks/app source, and study fixture/model implementations. Initialized Git and committed all 80 supplied files before editing. No remote repository changes or deployments are authorized or performed.

The upload does not include dotfiles/workflows referenced by its documentation. Do not infer that this snapshot is a GitHub checkout. Keep `package.json` dependency versions and `bun.lock` intact unless explicitly documented below.

Environment: Node 22.16.0 and system Chromium are available. Bun, the app's dependencies, and a project-local Biome are not installed. Direct downloads fail DNS resolution (`curl https://bun.sh/install`: exit 6); alternative download and tool discovery did not supply an executable runtime. Use a clearly separated offline validation harness with installed TypeScript and real native compression, not fabricated Bun/WASM/React results. Full build, Bun tests, installed Brotli WASM, and app Playwright checks remain required in a dependency-equipped environment.

## 02 — Initial format and safety decisions

Preserve v1 source, constants, key mappings and transforms byte-for-byte. Add a v2-owned representation grammar, strict tags, separately encoded base64url bodies and the `.` literal text mode. Unknown JSON remains literal data, including property names such as `__proto__`. Equality ignores object-key order but not array order, missing fields, Unicode code units or node boundaries.

Promote the integer CM model separately from the research framing. Use minimal decoded-length framing, CRC32, four explicit arithmetic termination bytes, bounded tables and bounded input. Do not count prototype zero-padding savings. Enforce a dedicated-worker deadline and publish only already validated progress on encode timeout.

Activation must follow the plan's gates. Missing browser/device/build evidence will be documented and must not be represented as a production pass.

## 03 — V2 envelope, JSON and Unicode implementation

Added `v2-constants.ts`, `v2-json.ts`, `v2-unicode.ts`, `v2-representations.ts`, and `v2-markdown.ts`. `WIRE.md` records the exact tag/default/slot/escape/window/parser contract. Full JSON is always available for unfamiliar or non-reconstructible shapes; typed encodings are exact-gated rather than assuming current Lexical defaults.

The contract preserves own properties, array order, node boundaries, missing fields, BOM, controls, surrogate code units, leading/trailing whitespace and blank paragraphs. Unknown fields and aliases use explicit namespaces/verbatim escapes. A test found that inherited `constructor`/`toString` names could reach reverse alias lookup; the v2-compatible restorer now uses `Object.hasOwn` and own-property definitions. Frozen v1 files were not modified to fix the new owner boundary.

Implementation decision requiring release review: all 56 binary reader combinations are registered for joint benchmarking and permanent diagnostic goldens, while eight binary tags are reserved. The final plan preferred registering only selected combinations. The provisional emission policy is pruned, but the reader table is a superset. This deliberate deviation and its compatibility implications are described in `WIRE.md`; do not hide it during handoff.

## 04 — CM promotion and independent framing

Added `src/lib/cm-codec.ts` and `cm-v2-corpus.ts`. The research scripts remain unchanged. The production model caps the hash exponent at 18 and pre-checks data, prime and model-array limits before constructing `Model`. All adaptive/integer parameters and corpus byte order are explicit. New frame: minimal ULEB128 decoded length, CRC32, arithmetic bytes and exactly four explicit termination bytes. The decoder never synthesizes zeros, requires exact consumption/final state and validates the checksum.

Reproduced the plan's original defect: the 36-byte input `A small note about the next meeting.` has a 28-byte prototype frame; dropping one byte silently changes the final punctuation/content. The new empty-prime frame is 35 bytes and rejects every truncated prefix. Public primed-CM tests cover truncation, bit corruption, invalid lengths and trailing data. Integrity overhead is included in all new size columns.

Added an independent allocation probe. At maximum 128 KiB data plus 64 KiB prime capacity it observed 11,565,075 model-instance array bytes; the five fixed module tables total 16,384, matching `modelArrayBytes()` at 11,581,459. This is not total JS heap/worker/app memory. No model cache or background keystroke recompression was added.

## 05 — Shared compressor repair and framing regression

Reworked `src/lib/compression.ts` without changing its v1-facing API. Owned `ArrayBuffer` BlobParts remove the original ambiguous backing-buffer type issue. Native reads are bounded while streaming, cancel incomplete work on failure, and release reader locks. Brotli uses incremental `DecompressStream`, checks input offsets/status/consumption and frees the WASM stream in `finally`; missing bounded support fails closed. The native measurement runtime is an explicitly injected offline seam, not a replacement for installed-WASM qualification.

The first native public contract run passed 388 cases and failed the trailing-deflate case. Node 22's native decoder accepted an extra byte. Added `src/lib/deflate-framing.ts`, a bounded count-only RFC 1951 scanner with stored/fixed/dynamic blocks, Huffman/distance validation and exact final-byte framing. Native inflate still validates/produces the output. Final native public contract: 389 pass, zero fail, two explicitly skipped v1 Brotli/WASM specimens. Independent zlib/prototype differential: 2,677 checks pass. Both the initial failure and fixed evidence are retained.

`compression.test.ts` now restores test-replaced globals and distinguishes initialization/facade mocks from real wire proof. The original study's implicit-any issue was not 'fixed' by promoting that script or representing it as acceptance code.

## 06 — Selector, progressive baseline and policy freeze

Added `src/codecs/v2.ts`: strict public decode, complete URL serialization, candidate reports, exact admission/readback, duplicate-body suppression, error isolation, deterministic shortest-fragment selection and validated progress. The v1-equivalent q11 baseline completes first where lossless; otherwise full JSON is the baseline. Unavailable/failing compressors fall back to deflate/raw. A result is never published before readback matches the input.

Exhaustive mode evaluates all seven representations, two Unicode encodings, raw/deflate/CM and Brotli 4/6/9/10/11. Completed 2,193 development and 1,031 evaluation candidate records with real native algorithms, exact reconstruction, shortest-completed selection and no eligible v1 growth.

Froze `v2-policy.ts` and `policy-freeze.json` using ONLY the supplemental development run before evaluation scoring. It keeps raw/deflate/literal, the forced baseline, useful text/split Brotli qualities, and text/tuple/Markdown CM. Ordinary candidates run first so slow CM does not hide a stronger ordinary fallback. Plain-eligible documents skip structural CM. This is a provisional native-derived schedule, not a browser/device-certified optimum.

All 96 shipping-schedule runs (32 states, three repeats) matched their exhaustive winner lengths. Four development runs exceeded the 500 ms target, maximum 804.0 ms. Candidate-level scheduling cannot preempt a synchronous candidate; the separate worker deadline remains two seconds. Neither these overruns nor low-gain high-entropy cases were removed from the evidence. The unique-token winner is split UTF-8 Brotli q4, not CM.

## 07 — Worker and app lifecycle integration

Added `worker-client.ts`, `v2.worker.ts`, and `config.ts`; updated the route dispatcher/types to recognize both versions without `/v20` prefix confusion. Every job owns a fresh dedicated worker. Cancellation, timeout, errors, success and message failures release listeners/timers/worker. Encode timeout/error can use already validated progress; decode timeout fails. Cancellation never commits a best-so-far result. The worker also exact-checks legacy encode output before allowing a v1 share that would lose data.

Updated `useDocument` for both versions, explicit empty links, hash/popstate reloads, cancellation and stale-result suppression. Added `documentKey` and keyed the editor on navigation; navigating from a loaded link to no hash now resets the editor instead of keeping old Lexical state.

Updated `useShareUrl` for an immediate JSON-cloned snapshot, duplicate suppression/preparing state, version/budget tracking, denied-clipboard retry and unmount/navigation abort. Late old requests cannot clear a newer request's busy state. Navigation resets old shared-version/budget metadata. Clipboard is written only after validated current encoding; history follows clipboard success and another ownership check. An already-issued browser clipboard operation cannot be atomically undone on later navigation; the notes make no contrary promise.

`ShareButton` displays a disabled preparing state with `aria-busy`; `VersionBadge` displays the actual shared/loaded version; `App` uses the configured writer for new notes. `Editor.tsx` and its normal full export remain unchanged. No server, package dependency, lockfile, redirect, editor architecture migration or deployment was added.

## 08 — Test owners and offline harness

Created immutable `tests/fixtures/wire-golden.json` (111 specimens), a rich AST fixture and shared public contracts under `tests/contract`. These exercise public bytes/representations, malformed metadata/Unicode, reconstruction limits, bombs, CM corruption and 150 seeded fuzz cases. A separate worker lifecycle contract uses fake ports strictly for ownership/cleanup/error behavior, not compression proof. Native and Chromium tests use real available algorithms for wire/size assertions.

Added `src/codecs/v2.test.ts` to launch the real-WASM public wire contract in a separate Bun process, avoiding the broad unit suite's global compressor mocks. Extended route/hook tests at their dispatch/lifecycle owners. Added Playwright share/load, snapshot/preparing, clipboard denial/retry, actual Chromium clipboard, immutable links, explicit empty, navigation/error recovery, badge and fragment-budget tests. Optional Firefox/WebKit projects are enabled by `ALL_BROWSERS=true`. These dependency-equipped app/unit runs have NOT executed here.

The network-free Chromium harness runs production core code in local wrappers and classic blob workers at `about:blank`. Managed URL policy prevented localhost navigation and opaque-origin module-worker loading; no policy bypass/change was attempted. Final run: 372 pass, zero fail, 29 skips, all workers terminated and browser closed. This is explicitly not Vite module-worker packaging, React/Lexical, WASM, Safari/Firefox, real mobile or actual app clipboard acceptance. The screenshot is of the harness, not the application.

Offline tools use the installed TypeScript 5.8.3 only to transpile/check syntax or core types. Minimal declarations are confined to `scripts/offline` and do not replace app dependencies or enter its tsconfig. Strict core-only check passed for 21 production files; syntax-only diagnostics passed for 66 files. Full TS 7/build/lint remain unverified. Biome was unavailable; no alternative formatter was used and no formatting pass is claimed. Review and run the required scoped Biome pass on a dependency-equipped checkout, preserving fixed wire semantics.

## 09 — Unified fixtures, challengers and accounting

Added a single installed-Lexical exporter for 14 + 8 + 17 development inputs and 10 authored evaluation inputs. It records source, UTF-8/code-unit, AST, lock and package hashes; missing dependency README inputs are errors, not silent omissions. Baseline source documents are copied under `fixtures/source/` to prevent README/AGENTS edits changing the benchmark.

Native runs deliberately use 22 supplemental reconstructed/manual states, NOT the unavailable complete original 39 exported ASTs. The authored evaluation set was frozen before native policy selection, has now been scored, and must not be called untouched in future tuning. It is not an externally collected blinded dataset. The default installed-WASM benchmark calls the unchanged public v1 encode/decode; `--native` uses the explicitly labeled native v1-equivalent baseline.

The existing approximately 10.6 KB corpus was compared with frozen 30/60 KiB deterministic synthetic technical augmentations and a 32 KiB native-deflate dictionary challenger. All 560 challenger candidates reconstructed exactly; none had a unique win over the combined pipeline. The larger corpora are not claimed as independently collected natural prose. The dictionary has no browser decoder and charges proposed framing; it is not emitted by the app. No runtime dependency/corpus/model change followed these comparisons.

Some long terminal invocations hit execution limits. Benchmark scripts save after each completed document and support hash-checked `--resume --limit=N`; final delivered reports all say `complete`. Timings remain the original per-candidate measurements across those batches. RSS fields only describe the final invocation/batch. A metadata-only correction clarified that scope in the later reports; the original development-exhaustive file was left byte-identical to preserve the policy-freeze SHA. No numeric candidate results were corrected or imputed. Browser cache labels were corrected to say fresh classic blob workers/warm in-memory page, and the final browser run was then repeated.

## 10 — Documentation, constraints and delivery

Updated README and AGENTS with the actual v2 status, reader permanence, local qualification flags/commands, limits and measured-scope cautions. Removed the old unsupported safe-word/browser-capacity table in favor of the explicit UI fragment-budget heuristic. Preserved all original studies/reviews and their scripts. `package.json` changes are scripts only; dependency/devDependency/override/engine versions and `bun.lock` are untouched.

`WIRE.md` is the restoration/framing contract; `RESULTS.md` is the measured/blocked acceptance matrix; `HANDOFF.md` explains archive contents, patch application, drift recovery and release gates. The delivery manifest records full baseline/implementation commits, the input ZIP hash, payload hashes and tree verification. Patches include all tracked code/tests/docs/evidence; generated patch/manifest/bundle files sit outside the source tree to avoid recursive self-inclusion.

Actual project commands were attempted and failed with exit 127 because Bun/bunx are absent: install, unit tests, installed-WASM verification, fixture export, build, Biome, app E2E and multi-engine qualification. No unavailable gate is represented as passed. Default writer v1 / CM disabled is deliberate release gating, not a claim that the plan's full production acceptance has been completed. The exact outstanding gates and additional reader-table/corpus limitations are in the handoff.
