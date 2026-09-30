# V2 codec contract and implementation notes

## Status and ownership

This is the implemented v2 contract, not authorization to activate production emission. `RELEASE_QUALIFIED` and `CM_QUALIFIED` remain false. Read `HANDOFF.md` and `RESULTS.md` before changing them. The serverless architecture is unchanged: a link contains its document, and no document is uploaded to a backend. The editor continues exporting its normal full `toJSON()` state.

The v1 codec, constants, transforms, key map, and base64 helpers are byte-identical to the supplied baseline. Shared compression infrastructure is now bounded; its frozen v1 comment describing an unbounded Brotli call no longer describes the facade it receives. Do not edit the historical file simply to update that comment.

## Envelope

A binary link is `/v2/#<tag><body>`. The tag is one ASCII character; **only the body** is unpadded base64url. No three-byte v1 header is carried inside it. The decoder rejects missing/unknown tags, non-alphabet characters, impossible base64 lengths and nonzero padding bits. Binary payloads are additionally limited before decompression.

The implemented reader table is:

| Representation | UTF-8 raw | UTF-8 deflate | UTF-8 Brotli | UTF-8 CM | Window raw | Window deflate | Window Brotli | Window CM |
|---|---|---|---|---|---|---|---|---|
| Full JSON | A | B | C | D | E | F | G | H |
| V1-equivalent JSON | I | J | K | L | M | N | O | P |
| Plain text | Q | R | S | T | U | V | W | X |
| Compact objects | Y | Z | a | b | c | d | e | f |
| Positional tuples | g | h | i | j | k | l | m | n |
| Split text | o | p | q | r | s | t | u | v |
| Frozen Markdown | w | x | y | z | 0 | 1 | 2 | 3 |

`4`, `5`, `6`, `7`, `8`, `9`, `-`, `_` are unassigned and rejected. `.` is the separate literal-text mode. Compressor quality does not need its own tag.

**Explicit plan deviation for review:** all 56 matrix combinations have registered readers and immutable diagnostic goldens, rather than reserving every non-emitted combination. The shipping search uses a much smaller subset. This makes exhaustive comparisons use the actual public decoder, but expands the reader contract. Review this choice before public activation; never reuse a tag after links containing it have been issued.

Literal mode is `.` plus eligible text encoded with `encodeURIComponent`, additionally escaping `!'()*~`, then replacing `%20` with `~`. Only URI-unreserved characters and `%HH` escapes appear after the dot. Decoding substitutes spaces for tildes and percent-decodes **once**, using strict Unicode. Thus `.Hello~world` is 12 fragment characters, `.%7E` is a literal tilde and `.%2520` is the text `%20`. `.` represents one default empty paragraph, not an absent share hash. Empty roots and explicit empty text-node shapes use other representations.

The selector constructs a real `URL` and compares its serialized fragment. Evidence also records full URLs using `https://notes.ilmtest.io`, whose `/v1/#` and `/v2/#` prefixes each cost 29 characters. A different origin changes the full-URL total.

## Equality and safety limits

The input contract is a canonical JSON serialized editor state with an object root. JSON equality ignores object-key order, but not missing properties, array order, field values, text-node boundaries or UTF-16 string code units. It is not an assertion that a future unknown node type can be rendered by the currently installed Lexical version.

Representation bytes and reconstructed serialized JSON are independently bounded at 2,097,152 bytes. Restoration also limits nesting to 64 and containers to 20,000. The plain/Markdown paths have an additional 6,000-line limit. `JsonBudget` charges restored defaults, escaped strings, keys and container syntax, rather than assuming that a small tuple means a small document. Untrusted object properties are created as own data properties; `__proto__`, `constructor`, `toString`, and aliases are never prototype lookups.

UTF-8 is decoded with `fatal: true` and `ignoreBOM: true`; the latter preserves a leading BOM as data. Direct text encodings reject lone surrogates. Full/escaped JSON preserves them through JSON's `\uXXXX` spelling. No normalization is performed.

Resource and malformed-input failures become `CodecError`. Limits are upper bounds, not a promise that every state under them finishes within the execution deadline. Raw and ordinary compression modes do not have a CM CRC: a mutation which produces another valid document cannot universally be detected. None of the formats authenticates the sender.

## Frozen Unicode window

`window8` begins with a two-byte big-endian window index. A window contains 128 Unicode scalar values. Valid indices are 0 through `0x21ff`, excluding surrogate windows `0x1b0` through `0x1bf`.

Bytes 0–126 are literal ASCII. Bytes 128–255 mean `windowIndex * 128 + byte - 128`. Byte 127 introduces an escape: one length byte (1–4), followed by exactly that many strict UTF-8 bytes encoding one scalar. Invalid lengths, surrogate values, partial escapes, or non-scalar strings fail. The encoder chooses the greatest estimated byte saving, breaking ties toward the smaller window. Selection still compares the complete final fragment; a language does not force this mode.

## Representations

### Full and v1-equivalent JSON

Full JSON does no renaming or default removal. It preserves future fields, unfamiliar node shapes, aliases, nested arrays and code units. It is the mandatory escape path.

The v1-equivalent candidate runs the original strip/minify/restore semantics and is eligible only when the result equals the original JSON. The v2 reader implements that restore meaning with its own reconstruction budget and explicit own-property lookups. Conflicting aliases are rejected. The original v1 files remain untouched. A v1 result that loses a property is not a legitimate smaller competitor.

### Default nodes and slots

The v2 defaults are independent of subsequent Lexical changes:

- Elements: `direction: null`, `format: ''`, `indent: 0`, `version: 1`.
- Text/code-highlight/tab: `detail: 0`, `format: 0`, `mode: 'normal'`, `style: ''`, `version: 1`.
- Paragraphs: element defaults plus `textFormat: 0`, `textStyle: ''`.
- Links: element defaults plus `rel: null`, `target: null`, `title: null`.
- Lists: element defaults plus `start: 1`; their tag derives from list type unless explicitly different.
- Line breaks: `version: 1` only.

Recognized nodes must actually contain the required default fields before the encoder can remove them. Missing fields are not silently invented on encode; those shapes take the verbatim form. An exact reconstruction gate runs even after these checks.

| Kind | Type | Positional slot | Default slot |
|---|---|---|---|
| 0 | root | none | null |
| 1 | paragraph | none | null |
| 2 | text | format | 0 |
| 3 | heading | tag | h1 |
| 4 | quote | none | null |
| 5 | list | listType | bullet |
| 6 | listitem | value | 1 |
| 7 | link | url | empty string |
| 8 | code | language | null means absent |
| 9 | code-highlight | format | 0 |
| 10 | linebreak | none | null |
| 11 | tab | format | 0 |

List types are bullet/number/check. Numeric slots must be safe integers. Code language is a string or the absent-language sentinel; an explicit null language is escaped so absence is not confused with presence. List tag defaults to `ol` for number, otherwise `ul`. Other properties live in an explicit extra object. Extras may override a default but cannot collide with the declared type/content/slot fields.

### Plain text

Only exact default paragraphs, with either no children or one exact default text node, are eligible. Newlines separate paragraphs. A default root with zero children, multiple adjacent text runs, per-paragraph formatting, direction/style overrides, missing metadata or unknown properties must not flatten into plain text. Blank and trailing paragraphs survive.

### Compact objects

A document wrapper is `{r: root}` or `{r: root, e: documentExtras}`. A recognized node has `t: kind`, `c: children` or `x: text` where applicable, optional `p: slot` and optional `e: extras`. A linebreak has no content. A verbatim node is exactly `{j: originalJson}`. Unknown envelope fields and mixed verbatim/typed forms are invalid. Application fields are not renamed into this envelope without an explicit namespace.

### Positional tuples

A typed node is `[kind, content]`, `[kind, content, slot]`, or `[kind, content, slot, extras]`. Content is a child array, text string or linebreak null. Kind 15 is the exact two-element verbatim escape `[15, originalJson]`. A default text node is a bare string. A default paragraph is its bare child array. A default root can be its bare child array at document scope. Non-default roots/document extras use the same `r`/`e` wrapper as above. Arrays are interpreted only at these defined grammar positions; application arrays remain inside verbatim JSON.

### Split text

The representation is JSON `[tupleSkeleton, combinedText]`. Text slots in the skeleton become `[14, lengthInUtf16CodeUnits]`. The decoder checks safe nonnegative lengths, available code units, each run boundary and the final consumed offset. Verbatim nodes remain verbatim rather than pretending to understand their fields. JSON escaping protects lone surrogate code units.

### Markdown

`v2-markdown.ts` owns the parser and serializer; decoding never calls an evolving Lexical Markdown importer. The admitted canonical subset contains paragraphs, headings h1–h6, single-line quotes, flat ordered/bullet lists (ordered start 1), restricted-language triple-backtick code fences, bold/italic/both, inline code and links. ASCII Markdown punctuation is escaped. Unsupported nesting, attributes, styles, underline, custom list starts or shapes fail admission and use another representation. The decoder requires canonical reserialization, and the encoder additionally requires exact restored JSON equality. Inline parsing has a depth cap of 32. The file and its fixed goldens are the executable grammar, not a claim of general CommonMark support.

## CM arithmetic model and frame

`src/lib/cm-codec.ts` is separate from the preserved research `scripts/cm-codec.ts`. Model computations, probability tables and adaptation parameters are frozen. The maximum hashed-table exponent is 18; the match hash exponent is 18. `DEFAULT_PARAMS` records all rates and limits. Both directions learn the same version-owned prime before processing document bytes.

Prime source files total 10,650 bytes before the inserted separators. Text/Markdown uses `RICH + '\n' + ARABIC + '\n' + ENGLISH`; structural modes use `ARABIC + '\n' + ENGLISH + '\n' + RICH + '\n'`. The source strings and SHA-256 values are embedded in `cm-v2-corpus.ts`; returned prime arrays are copies. Prime content, ordering, whitespace and table sizing are part of the bitstream.

A CM frame consists of:

1. Minimal unsigned LEB128 decoded representation length (at most three bytes; maximum 131,072).
2. Four-byte big-endian CRC32 of those decoded bytes. Reflected polynomial `0xedb88320`, initial/final XOR `0xffffffff`.
3. Arithmetic payload, ending in exactly four explicitly written big-endian bytes of the final lower bound `x1`.

The arithmetic decoder never synthesizes zeros. It must consume the exact frame, finish with code register equal to `x1`, and match the CRC. Extra bytes, missing termination, nonminimal/oversized lengths and mismatched checksums fail. An empty CM frame still costs nine bytes before tag/base64; it does not become an empty URL hash.

Before any `Model` field initializes, the codec bounds representation length at 128 KiB, prime length at 64 KiB and all model arrays at 16 MiB. The maximum allocated model arrays are **11,581,459 bytes**, verified by instrumenting native typed-array constructors plus counting the five fixed module tables. Corpus copies, arithmetic output arrays, decoded bytes, JS objects, WASM, browser and worker overhead are separate. Do not call that number peak worker memory.

## Bounded ordinary compressors

Native deflate uses owned `ArrayBuffer` BlobParts, avoiding the original `ArrayBufferLike` type mismatch. `readBoundedChunks` checks each chunk before retaining it, cancels an incomplete reader on error and always releases its lock.

A count-only RFC 1951 scanner runs before native inflation. It accepts stored/fixed/dynamic blocks, counts output without allocating it, validates distances and tables, detects missing final data, and rejects extra full bytes after the final block. Padding bits in the last byte are permitted. This is needed because the native Node version used here accepted trailing bytes despite the compression standard's stricter framing requirement. Native decompression still verifies the compressed stream and its exact counted output length.

Brotli uses `brotli-wasm`'s `DecompressStream` facade, bounded input/output chunks, checked `input_offset` and result codes, full-consumption checks and `free()` in `finally`. It does not fall back to an unbounded one-shot inflate when streaming support is absent. The actual installed WASM path is an outstanding qualification gate; native Brotli is not a substitute for that gate.

Primary algorithm/API references: RFC 1951 section 3.2 (`https://datatracker.ietf.org/doc/html/rfc1951`), WHATWG Compression Standard (`https://compression.spec.whatwg.org/`), and the upstream `httptoolkit/brotli-wasm` streaming API/tests. No external parser or dictionary decoder dependency was added.

## Search and worker lifecycle

Search first finishes and validates a v1-equivalent q11 baseline where lossless, otherwise full JSON. Failed/unavailable Brotli falls back to deflate then raw. A baseline that cannot finish before the worker deadline produces an error, not an unvalidated or larger claimed-baseline link.

The offline exhaustive search compares all families, both Unicode transforms, raw/deflate/CM and Brotli qualities 4/6/9/10/11, deduplicating identical representation bodies. The provisional shipping policy is frozen in `v2-policy.ts`: preserve literal/raw/deflate and the forced q11 baseline, then test text UTF-8 Brotli q11, window text Brotli q4, split UTF-8 Brotli q4, and eligible text/tuple/Markdown UTF-8 CM. Ordinary candidates complete before CM. Plain-eligible states skip structural CM passes. The policy was frozen on supplemental development results before evaluation scoring; it is not yet a WASM/mobile-qualified optimum.

Every candidate is decoded by its public mode and compared with the input before publication. Shorter fragments win; equal-length fragments use lexicographic tie-breaking. The 500 ms target is checked between candidates, so one synchronous candidate can overrun it. A separate dedicated-worker deadline of two seconds terminates the request when the main-thread timer fires. Encode timeout/error returns only the shortest validated progress received so far; decode timeout fails. Cancellation always rejects, even with valid progress. Readers, timers, listeners, WASM streams, and workers are released on normal and failing paths.

A share owns its JSON-cloned requested snapshot. Duplicate shares are disabled. Navigation/unmount aborts stale work. The clipboard receives a validated current result first; history/badge/budget commit only after clipboard success and another current-request check. Clipboard denial leaves the URL unchanged and permits retry. A clipboard write already handed to the browser cannot be canceled atomically on later navigation, so this is not a transactional clipboard/history rollback guarantee.
