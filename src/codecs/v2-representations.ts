import { expandKeys, KEY_MAP, minifyKeys } from './keymap';
import {
    REVERSE_VALUE_MAP,
    BARE_NODE_DEFAULTS as V1_BARE,
    ELEMENT_NODE_DEFAULTS as V1_ELEMENT,
    TEXT_NODE_DEFAULTS as V1_TEXT,
} from './v1-constants';
import { expandValues, minifyValues, restoreDefaults, stripDefaults } from './v1-transforms';
import {
    ELEMENT_DEFAULTS,
    KINDS,
    PARAGRAPH_DEFAULTS,
    type Representation,
    SPLIT_REF,
    TEXT_DEFAULTS,
    TEXT_KINDS,
    VERBATIM,
} from './v2-constants';
import {
    asArray,
    asObject,
    fail,
    hasLoneSurrogate,
    isObject,
    type Json,
    JsonBudget,
    type Obj,
    parseJson,
    sameJson,
} from './v2-json';
import { decodeMarkdown, encodeMarkdown } from './v2-markdown';

export type Body = { representation: Representation; text: string };
const own = (value: Obj, key: string): boolean => Object.hasOwn(value, key);
const entriesWithout = (value: Obj, excluded: readonly string[]): Obj =>
    Object.fromEntries(Object.entries(value).filter(([k]) => !excluded.includes(k)));
const defaultsFor = (type: string): Obj => {
    if (TEXT_KINDS.has(type)) {
        return TEXT_DEFAULTS;
    }
    if (type === 'paragraph') {
        return PARAGRAPH_DEFAULTS;
    }
    if (type === 'linebreak') {
        return { version: 1 };
    }
    if (type === 'link') {
        return { ...ELEMENT_DEFAULTS, rel: null, target: null, title: null };
    }
    if (type === 'list') {
        return { ...ELEMENT_DEFAULTS, start: 1 };
    }
    return ELEMENT_DEFAULTS;
};
const slotKey = (kind: number): string | null =>
    (
        ({
            2: 'format',
            3: 'tag',
            5: 'listType',
            6: 'value',
            7: 'url',
            8: 'language',
            9: 'format',
            11: 'format',
        }) as Record<number, string>
    )[kind] ?? null;
const slotDefault = (kind: number): Json =>
    (({ 2: 0, 3: 'h1', 5: 'bullet', 6: 1, 7: '', 9: 0, 11: 0 }) as Record<number, Json>)[kind] ?? null;
const validSlot = (kind: number, slot: Json): boolean => {
    if ([2, 6, 9, 11].includes(kind)) {
        return typeof slot === 'number' && Number.isSafeInteger(slot);
    }
    if (kind === 5) {
        return slot === 'bullet' || slot === 'number' || slot === 'check';
    }
    if ([3, 7].includes(kind)) {
        return typeof slot === 'string';
    }
    if (kind === 8) {
        return slot === null || typeof slot === 'string';
    }
    return slot === null;
};
type Parts = { kind: number; content: Json; extra: Obj; slot: Json };
const nodeParts = (value: Json): Parts | null => {
    if (!isObject(value) || typeof value.type !== 'string') {
        return null;
    }
    const type = value.type;
    const kind = (KINDS as readonly string[]).indexOf(type);
    if (kind < 0) {
        return null;
    }
    const defaults = defaultsFor(type);
    if (Object.keys(defaults).some((k) => !own(value, k))) {
        return null;
    }
    const text = TEXT_KINDS.has(type);
    if (
        text
            ? typeof value.text !== 'string' || own(value, 'children')
            : type === 'linebreak'
              ? own(value, 'text') || own(value, 'children')
              : !Array.isArray(value.children) || own(value, 'text')
    ) {
        return null;
    }
    const key = slotKey(kind);
    if (key && kind !== 8 && !own(value, key)) {
        return null;
    }
    const slot = key && own(value, key) ? value[key] : slotDefault(kind);
    if (!validSlot(kind, slot) || (kind === 8 && own(value, 'language') && slot === null)) {
        return null;
    }
    if (kind === 5 && !own(value, 'tag')) {
        return null;
    }
    const extra = entriesWithout(value, ['type', 'text', 'children', ...(key ? [key] : [])]);
    for (const [k, v] of Object.entries(defaults)) {
        if (extra[k] === v) {
            delete extra[k];
        }
    }
    if (kind === 5 && extra.tag === (slot === 'number' ? 'ol' : 'ul')) {
        delete extra.tag;
    }
    return { content: text ? value.text : type === 'linebreak' ? null : value.children, extra, kind, slot };
};

type SplitEncode = { chunks: string[] };
type SplitDecode = { text: string; offset: number };
const packText = (text: string, split?: SplitEncode): Json => {
    if (!split) {
        return text;
    }
    split.chunks.push(text);
    return [SPLIT_REF, text.length];
};
const readText = (value: Json, split?: SplitDecode): string => {
    if (!split) {
        return typeof value === 'string' ? value : fail('Invalid text slot.');
    }
    if (!Array.isArray(value) || value.length !== 2 || value[0] !== SPLIT_REF) {
        return fail('Invalid split-text reference.');
    }
    const length = value[1];
    if (
        typeof length !== 'number' ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > split.text.length - split.offset
    ) {
        return fail('Invalid split-text length.');
    }
    const text = split.text.slice(split.offset, split.offset + length);
    split.offset += length;
    return text;
};
const packTupleNode = (value: Json, split?: SplitEncode): Json => {
    const parts = nodeParts(value);
    if (!parts) {
        return [VERBATIM, value];
    }
    const { kind, extra, slot } = parts;
    const content = TEXT_KINDS.has(KINDS[kind])
        ? packText(parts.content as string, split)
        : Array.isArray(parts.content)
          ? parts.content.map((v) => packTupleNode(v, split))
          : null;
    const hasExtra = Object.keys(extra).length !== 0;
    if (kind === 2 && slot === 0 && !hasExtra) {
        return content;
    }
    if (kind === 1 && !hasExtra) {
        return content;
    }
    if (hasExtra) {
        return [kind, content, slot, extra];
    }
    if (!sameJson(slot, slotDefault(kind))) {
        return [kind, content, slot];
    }
    return [kind, content];
};
const packTuples = (state: Obj, split?: SplitEncode): Json => {
    const root = packTupleNode(state.root, split);
    const extra = entriesWithout(state, ['root']);
    if (!Object.keys(extra).length && Array.isArray(root) && root.length === 2 && root[0] === 0) {
        return root[1];
    }
    return Object.keys(extra).length ? { e: extra, r: root } : { r: root };
};
const packCompactNode = (value: Json): Json => {
    const parts = nodeParts(value);
    if (!parts) {
        return { j: value };
    }
    const { kind, extra, slot, content } = parts;
    const out: Obj = { t: kind };
    if (TEXT_KINDS.has(KINDS[kind])) {
        out.x = content;
    } else if (Array.isArray(content)) {
        out.c = content.map(packCompactNode);
    }
    if (!sameJson(slot, slotDefault(kind))) {
        out.p = slot;
    }
    if (Object.keys(extra).length) {
        out.e = extra;
    }
    return out;
};
const packCompact = (state: Obj): Json => {
    const extra = entriesWithout(state, ['root']);
    return Object.keys(extra).length
        ? { e: extra, r: packCompactNode(state.root) }
        : { r: packCompactNode(state.root) };
};

const buildKnown = (
    kind: number,
    content: Json,
    slot: Json,
    extra: Obj,
    budget: JsonBudget,
    readNode: (value: Json, depth: number) => Json,
    depth: number,
    split?: SplitDecode,
): Obj => {
    if (!Number.isInteger(kind) || kind < 0 || kind >= KINDS.length || !validSlot(kind, slot)) {
        return fail('Invalid node tuple.');
    }
    const type = KINDS[kind];
    const key = slotKey(kind);
    if (['type', 'children', 'text', ...(key ? [key] : [])].some((k) => own(extra, k))) {
        return fail('Conflicting extra node properties.');
    }
    const fields: Obj = { ...defaultsFor(type), type };
    if (key && !(kind === 8 && slot === null)) {
        fields[key] = slot;
    }
    if (kind === 5) {
        fields.tag = slot === 'number' ? 'ol' : 'ul';
    }
    for (const [k, v] of Object.entries(extra)) {
        Object.defineProperty(fields, k, { configurable: true, enumerable: true, value: v, writable: true });
    }
    if (TEXT_KINDS.has(type)) {
        fields.text = readText(content, split);
        return budget.object(fields, [], depth);
    }
    if (type === 'linebreak') {
        if (content !== null) {
            return fail('Invalid linebreak content.');
        }
        return budget.object(fields, [], depth);
    }
    const children = asArray(content);
    fields.children = budget.array(
        children.map((child) => readNode(child, depth + 2)),
        true,
        depth + 1,
    );
    return budget.object(fields, ['children'], depth);
};
const makeTupleReader = (budget: JsonBudget, split?: SplitDecode) => {
    const read = (value: Json, depth: number): Json => {
        if (typeof value === 'string' || (split && Array.isArray(value) && value[0] === SPLIT_REF)) {
            return buildKnown(2, value, 0, {}, budget, read, depth, split);
        }
        const tuple = asArray(value);
        if (!tuple.length || typeof tuple[0] !== 'number') {
            return buildKnown(1, tuple, null, {}, budget, read, depth, split);
        }
        if (tuple[0] === VERBATIM) {
            if (tuple.length !== 2) {
                return fail('Invalid verbatim node.');
            }
            return budget.copy(tuple[1], depth);
        }
        if (tuple.length < 2 || tuple.length > 4) {
            return fail('Invalid tuple length.');
        }
        return buildKnown(
            tuple[0],
            tuple[1],
            tuple.length >= 3 ? tuple[2] : slotDefault(tuple[0]),
            tuple.length === 4 ? asObject(tuple[3]) : {},
            budget,
            read,
            depth,
            split,
        );
    };
    return read;
};
const makeCompactReader = (budget: JsonBudget) => {
    const read = (value: Json, depth: number): Json => {
        const node = asObject(value);
        if (own(node, 'j')) {
            if (Object.keys(node).length !== 1) {
                return fail('Invalid verbatim node.');
            }
            return budget.copy(node.j, depth);
        }
        if (Object.keys(node).some((k) => !['t', 'c', 'x', 'p', 'e'].includes(k)) || typeof node.t !== 'number') {
            return fail('Invalid compact node.');
        }
        const kind = node.t;
        const type = KINDS[kind];
        const text = TEXT_KINDS.has(type);
        if (
            text
                ? !own(node, 'x') || own(node, 'c')
                : type === 'linebreak'
                  ? own(node, 'x') || own(node, 'c')
                  : !own(node, 'c') || own(node, 'x')
        ) {
            return fail('Invalid compact content.');
        }
        return buildKnown(
            kind,
            text ? node.x : type === 'linebreak' ? null : node.c,
            own(node, 'p') ? node.p : slotDefault(kind),
            own(node, 'e') ? asObject(node.e) : {},
            budget,
            read,
            depth,
        );
    };
    return read;
};
const unpackState = (packed: Json, compact: boolean, split?: SplitDecode): Obj => {
    const budget = new JsonBudget();
    const read = compact ? makeCompactReader(budget) : makeTupleReader(budget, split);
    if (!compact && Array.isArray(packed)) {
        const root = buildKnown(0, packed, null, {}, budget, read, 1, split);
        return budget.object({ root }, ['root']);
    }
    const wrapper = asObject(packed);
    if (!own(wrapper, 'r') || Object.keys(wrapper).some((k) => !['r', 'e'].includes(k))) {
        return fail('Invalid document wrapper.');
    }
    const extra = own(wrapper, 'e') ? asObject(wrapper.e) : {};
    if (own(extra, 'root')) {
        return fail('Conflicting root property.');
    }
    return budget.object({ ...extra, root: read(wrapper.r, 1) }, ['root']);
};

export const plainState = (text: string): Obj => {
    if (hasLoneSurrogate(text)) {
        return fail('Raw text contains unpaired surrogates.');
    }
    // Check count BEFORE split(), preventing a tiny-text/millions-of-paragraphs allocation.
    let lines = 1;
    for (const c of text) {
        if (c === '\n' && ++lines > 6000) {
            return fail('Plain document has too many paragraphs.');
        }
    }
    const budget = new JsonBudget();
    const paragraphs = text.split('\n').map((line) => {
        const children = budget.array(
            line ? [budget.object({ ...TEXT_DEFAULTS, text: line, type: 'text' }, [], 5)] : [],
            true,
            4,
        );
        return budget.object({ ...PARAGRAPH_DEFAULTS, children, type: 'paragraph' }, ['children'], 3);
    });
    const children = budget.array(paragraphs, true, 2);
    const root = budget.object({ ...ELEMENT_DEFAULTS, children, type: 'root' }, ['children'], 1);
    return budget.object({ root }, ['root']);
};
export const eligiblePlainText = (state: Obj): string | null => {
    const root = asObject(state.root);
    if (!Array.isArray(root.children) || !root.children.length) {
        return null;
    }
    const lines: string[] = [];
    for (const child of root.children) {
        if (!isObject(child) || child.type !== 'paragraph' || !Array.isArray(child.children)) {
            return null;
        }
        if (!child.children.length) {
            lines.push('');
            continue;
        }
        if (child.children.length !== 1) {
            return null;
        }
        const text = child.children[0];
        if (
            !isObject(text) ||
            text.type !== 'text' ||
            typeof text.text !== 'string' ||
            /[\r\n]/.test(text.text) ||
            hasLoneSurrogate(text.text)
        ) {
            return null;
        }
        lines.push(text.text);
    }
    const text = lines.join('\n');
    try {
        return sameJson(plainState(text), state) ? text : null;
    } catch {
        return null;
    }
};
export const v1Body = (state: Obj): string | null => {
    const transformed = minifyValues(minifyKeys(stripDefaults(state)));
    return sameJson(restoreDefaults(expandKeys(expandValues(transformed))) as Json, state)
        ? JSON.stringify(transformed)
        : null;
};

// Bounded implementation of the existing v1 restore meaning, without changing v1 files.
// Alias collisions in hostile wire input are rejected rather than overwritten.
const reverseKeys: Readonly<Record<string, string>> = Object.freeze(
    Object.fromEntries(Object.entries(KEY_MAP).map(([a, b]) => [b, a])),
);
const unpackV1 = (value: Json): Json => {
    const budget = new JsonBudget();
    const read = (v: Json, depth: number): Json => {
        if (Array.isArray(v)) {
            return budget.array(
                v.map((child) => read(child, depth + 1)),
                true,
                depth,
            );
        }
        if (!isObject(v)) {
            return budget.copy(v, depth);
        }
        const mapped: Obj = {};
        for (const [key, nested] of Object.entries(v)) {
            const full = Object.hasOwn(reverseKeys, key) ? reverseKeys[key] : key;
            if (own(mapped, full)) {
                return fail('Conflicting v1-compatible keys.');
            }
            const values = Object.hasOwn(REVERSE_VALUE_MAP, key) ? REVERSE_VALUE_MAP[key] : undefined;
            const data =
                typeof nested === 'string' && values && Object.hasOwn(values, nested) ? values[nested] : nested;
            Object.defineProperty(mapped, full, { configurable: true, enumerable: true, value: data });
        }
        const type = mapped.type;
        const defaults =
            typeof type !== 'string'
                ? {}
                : type === 'linebreak'
                  ? V1_BARE
                  : TEXT_KINDS.has(type)
                    ? V1_TEXT
                    : V1_ELEMENT;
        const fields: Obj = Object.fromEntries(Object.entries(defaults)) as Obj;
        const accounted: string[] = [];
        for (const [key, nested] of Object.entries(mapped)) {
            Object.defineProperty(fields, key, {
                configurable: true,
                enumerable: true,
                value: read(nested, depth + 1),
                writable: true,
            });
            accounted.push(key);
        }
        return budget.object(fields, accounted, depth);
    };
    return read(value, 0);
};
export const decodeRepresentation = (representation: Representation, text: string): Json => {
    if (representation === 'text') {
        return plainState(text);
    }
    if (representation === 'markdown') {
        return decodeMarkdown(text);
    }
    const parsed = parseJson(text);
    if (representation === 'json') {
        return parsed;
    }
    if (representation === 'v1') {
        return unpackV1(parsed);
    }
    if (representation === 'compact') {
        return unpackState(parsed, true);
    }
    if (representation === 'tuples') {
        return unpackState(parsed, false);
    }
    const split = asArray(parsed);
    if (split.length !== 2 || typeof split[1] !== 'string') {
        return fail('Invalid split-text wrapper.');
    }
    const context = { offset: 0, text: split[1] };
    const result = unpackState(split[0], false, context);
    if (context.offset !== context.text.length) {
        return fail('Unconsumed split-text data.');
    }
    return result;
};
export const representationBodies = function* (state: Obj): Generator<Body> {
    yield { representation: 'json', text: JSON.stringify(state) };
    const v1 = v1Body(state);
    if (v1 !== null) {
        yield { representation: 'v1', text: v1 };
    }
    const text = eligiblePlainText(state);
    if (text !== null) {
        yield { representation: 'text', text };
    }
    yield { representation: 'compact', text: JSON.stringify(packCompact(state)) };
    yield { representation: 'tuples', text: JSON.stringify(packTuples(state)) };
    const split: SplitEncode = { chunks: [] };
    const skeleton = packTuples(state, split);
    yield { representation: 'split', text: JSON.stringify([skeleton, split.chunks.join('')]) };
    const markdown = encodeMarkdown(state);
    if (markdown !== null) {
        yield { representation: 'markdown', text: markdown };
    }
};
