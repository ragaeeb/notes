# Codex handoff — notes compression implementation

## Read this first

This delivery implements the v2 codec, hardened CM, bounded ordinary decoders, candidate search, worker lifecycle, route/hook/UI integration and validation tooling from `docs/compression-implementation-plan.md`. It is **not a production-qualified release**. The default writer remains v1 (`RELEASE_QUALIFIED=false`), and CM emission remains off (`CM_QUALIFIED=false`). Do not deploy or flip those flags solely because the patch applies or the local qualification flags exist.

Executed evidence: 389 native public/worker contract passes (two declared skips); 372 Chromium-core/worker passes (29 declared skips); 2,677 differential/framing checks; 3,224 exhaustive native candidate records over 32 supplemental states; 2,913 shipping-schedule records over three repeats of those states; 560 corpus/dictionary challenger records; instrumented 11,581,459-byte maximum model arrays. No selected-candidate mismatch, exact-round-trip failure or eligible v1 size regression occurred in those completed sweeps. The plan's full original 39 Lexical-exported cases and installed-WASM/app/device acceptance have not run.

Read in order: repository `AGENTS.md`; the original plan; `docs/implementation/LEDGER.md` (decisions and file ownership); `WIRE.md` (frozen meanings); `RESULTS.md` (actual scope, numbers, failure history and commands). Do not confuse an offline core test with an application E2E pass.

## Archive contents

The delivery ZIP has these root entries:

- `HANDOFF.md`: convenience copy of this file; identical to `code/HANDOFF.md`.
- `code/`: complete source snapshot, original files plus implementation/tests/benchmarks/docs/evidence. No `.git`, `node_modules`, `dist`, transient offline bundles or installed font/tool binaries.
- `patches/notes-compression.patch`: complete binary-capable unified diff from the exact supplied baseline to the final implementation commit.
- `patches/0001-notes-compression.patch`: the same changes in Git email/`git am` format. Apply **one** patch format, never both.
- `repository.bundle`: local Git history containing the supplied baseline and implementation commit, for exact reconstruction and three-way recovery. It is not a remote repository connection.
- `MANIFEST.json`: input ZIP hash, full commit/tree IDs, relative payload paths and SHA-256 values. It does not hash itself. Source-tree files/patches are hashed after creation.
- `PATCH-VERIFICATION.json`: actual clean-baseline `git apply`, `git am`, tree-equality and bundle verification results.

The baseline is the **user-supplied ZIP**, not a fetched GitHub revision:

```
Baseline commit: c0ae6eecd1c0d1152d3c30f802494908a86f9f85
Input ZIP: notes-1.0.0.zip
Input ZIP SHA-256: 407c5d096a3fe8d62cda35dcbccede748423c1221d3fed64fe369738656ce81c
```

The implementation commit ID is in `MANIFEST.json` because embedding its own hash in a committed document would be self-referential. Its baseline has all 80 uploaded files. Dotfile/workflow omissions in that upload were not filled in from an assumed GitHub checkout. `.gitignore` is new. Dependency versions and `bun.lock` are preserved; package-script additions are documented.

## Apply to a matching checkout

From your target repository, first inspect/stash/commit your own local work. Do not discard it. Check that the frozen v1 files, original studies and dependency lock correspond to the uploaded baseline. Then, with `DELIVERY` set to the extracted archive's absolute path:

```bash
# Inspect before applying. This patch contains code AND tests/docs/raw evidence.
git apply --stat "$DELIVERY/patches/notes-compression.patch"
git apply --check "$DELIVERY/patches/notes-compression.patch"
git apply "$DELIVERY/patches/notes-compression.patch"
git diff --check
```

Alternatively, use `git am "$DELIVERY/patches/0001-notes-compression.patch"` on the baseline to retain the implementation commit's message and authorship. Do not apply the unified patch first and then `git am` the same change.

The delivery's verification clones the bundle, checks out the baseline, applies each patch format separately and compares the resulting tree to the implementation tree. That proves packaging/application consistency, **not** build or production qualification.

## Reconstruct or handle drift

For an exact reference checkout:

```bash
git clone "$DELIVERY/repository.bundle" notes-compression-reference
cd notes-compression-reference
git log --oneline --all
```

When your working branch has drifted, do not blindly overwrite it with `code/` or force a rejected hunk. Create a separate worktree/branch, inspect `git diff BASELINE..IMPLEMENTATION` in the reference clone and use the ledger's owner-by-owner notes. Fetch the bundle's objects into that review branch when three-way context is useful:

```bash
git fetch "$DELIVERY/repository.bundle" HEAD
# Review FETCH_HEAD and the local target; then on the intended integration branch:
git cherry-pick FETCH_HEAD
```

Resolve conflicts explicitly and re-run all gates. `git am --3way` is also suitable once the baseline blob objects are available. Follow normal `--continue`/`--abort` workflows; do not use reset/clean to erase unrelated user work. Preserve the old codec files and unknown-field escape behavior. A source diff or corpus/parser/default change can alter link meaning even if the UI still looks correct.

## Ownership map

`v2-constants/json/unicode/representations/markdown.ts` own the wire and restoration rules. `cm-codec.ts`/`cm-v2-corpus.ts` own the integer model and integrity frame. `compression.ts`/`deflate-framing.ts` own bounded ordinary decompression. `v2.ts` selects only fully validated results; `v2-policy.ts` changes encoding order, not decoding meaning. `worker-client.ts` and `v2.worker.ts` own request/deadline/progress cleanup. Route helpers, document/share hooks and App/ShareButton/VersionBadge own UI lifecycle.

`tests/fixtures/wire-golden.json` is immutable input, not output to regenerate during assertions. `tests/contract` contains actual-wire and separate lifecycle contracts. `src/codecs/v2.test.ts` launches the wire checks in an isolated Bun process so unit compressor mocks cannot become compression evidence. `tests/e2e` holds actual application acceptance tests, including a real Chromium clipboard test; cross-engine clipboard lifecycle tests use an explicitly named seam.

`scripts/compression` contains the single installed-Lexical export/benchmark/verification path. `scripts/offline` is supplemental tooling for environments missing project dependencies. Its minimal type declarations and native compressor adapter are not app dependency substitutes. `docs/implementation/evidence` includes full numeric records and diagnostic failures, not just selected successes.

## Qualification workflow on an equipped machine

Use the project's declared Bun version and dependencies. Do not silently downgrade libraries/lockfiles to make this environment's native results reproduce.

```bash
bun install --frozen-lockfile
bun run compression:fixtures
bun run compression:verify
bun test
bun run build
bunx biome check src
bun run test:e2e
bun run compression:qualify
git diff --check
```

`compression:qualify` opts into v2+CM locally and enables Chromium/Firefox/WebKit Playwright projects. Install the required Playwright browser engines with the project's tooling when needed. Do not reuse a Vite server started under the opposite writer flags. Actual mobile hardware/cold asset startup and memory measurements are separate from desktop engine emulation.

For an interactive local app run, use:

```bash
VITE_ENABLE_V2=true VITE_ENABLE_CM_EXPERIMENTAL=true bun dev
```

Review/commit the exported 49-state manifest before benchmarking. The default benchmark requires the actual installed WASM backend and unchanged public v1 encoder/decoder. It fails instead of silently substituting native Brotli. Compare development exhaustive and shipping schedules first:

```bash
bun run compression:benchmark --set=development
bun run compression:benchmark --set=development --shipping
```

If any model, corpus, parser, mode set or policy is changed, freeze it against development/training data before scoring a **fresh** untouched evaluation set. The supplied ten authored evaluation inputs have already been scored. Do not keep tuning on them while claiming held-out acceptance. Do not sum the old papers' CM/Markdown percentage savings. Measure tags, metadata, CRC/termination and real serialized URLs again.

Biome was unavailable here. Formatting/lint is an outstanding gate, and the compact new source may require the repository's prescribed formatting fixes. Do not use another formatter or change frozen object construction order/corpus bytes casually: fixed CM goldens and candidate sizes must be reverified after autofixes. Full app type checking, the build and new React/E2E test execution also remain outstanding; syntax/core-only checks are not substitutes.

## Gates and known limitations that must remain visible

1. **Runtime/application:** Bun, project dependencies and actual Brotli WASM were unavailable. The declared Node requirement is >=24; native evidence used 22.16.0. Full unit/type/build/Biome/application E2E commands were attempted and exit 127. There is no build, React, Vite module-worker/WASM-asset, actual app clipboard or deployment pass to infer.
2. **Browsers/devices:** Chromium core used local wrappers/classic blob workers at `about:blank` because managed URL policy blocked navigation. No policy was modified. Node+Chromium byte equality is V8-family evidence, not Firefox/Safari/Bun acceptance. Real mobile, cold/warm deployed startup and peak worker/app memory are unverified. Model-array bytes and summed Chromium RSS must not be conflated.
3. **Dataset/model:** Executed results cover 22 supplemental development and 10 authored evaluation states, not the exact original 39 Lexical exports. Larger corpus challengers are synthetic technical augmentation, not independent natural-prose corpora, and tested UTF-8 only. The native-derived policy/model is provisional; no dictionary decoder dependency was adopted.
4. **Budgets:** All 96 shipping runs matched exhaustive winner lengths, but four development runs exceeded the 500 ms target (maximum 804 ms). Worker timeout returns only completed validated progress; a baseline that itself cannot finish must fail. No universal size/latency/global-optimum promise is made.
5. **Format/plan review:** All 56 binary decoder combinations are registered, although emission is pruned; the plan preferred reserving non-emitted combinations. Review this explicit reader-superset deviation before issuing links. Never reassign already issued tags. CRC32 is not authentication. A current browser may not render a future unknown Lexical node even though the codec preserves its JSON exactly.
6. **Clipboard races:** A stale request cannot commit history after cancellation. A browser clipboard write that has already started cannot be atomically rolled back when navigation happens. Permission failure is retryable without changing history; do not claim a stronger transactional guarantee.

After these gates pass, record the selected engine/device list, measured budgets, final mode/model/corpus/policy hashes and release decision, then change the writer/CM qualification constants deliberately. Until then, the default v1 writer is intentional. No remote push, deployment or user data transmission is part of this delivery.
