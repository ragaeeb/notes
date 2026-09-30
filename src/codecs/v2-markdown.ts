// Version-owned, deliberately conservative Markdown grammar. No Lexical importer or
// external parser is used to interpret an issued link.
import { ELEMENT_DEFAULTS, PARAGRAPH_DEFAULTS, TEXT_DEFAULTS } from './v2-constants';
import {
    asArray,
    asObject,
    fail,
    hasLoneSurrogate,
    isObject,
    type Json,
    JsonBudget,
    type Obj,
    sameJson,
} from './v2-json';

const escapeText = (text: string): string => text.replace(/[\\`*_[\]()#>+\-.!]/g, '\\$&');
const escapeUrl = (text: string): string => text.replace(/[\\()]/g, '\\$&');
const lineSafe = (text: string): boolean => !/[\r\n]/.test(text) && !hasLoneSurrogate(text);
const inlineString = (children: Json[]): string =>
    children
        .map((value) => {
            const node = asObject(value);
            if (node.type === 'link') {
                if (typeof node.url !== 'string' || !lineSafe(node.url)) {
                    return fail();
                }
                return `[${inlineString(asArray(node.children))}](${escapeUrl(node.url)})`;
            }
            if (node.type !== 'text' || typeof node.text !== 'string' || !node.text || !lineSafe(node.text)) {
                return fail();
            }
            const text = escapeText(node.text);
            if (node.format === 0) {
                return text;
            }
            if (node.format === 1) {
                return `**${text}**`;
            }
            if (node.format === 2) {
                return `*${text}*`;
            }
            if (node.format === 3) {
                return `***${text}***`;
            }
            if (node.format === 16) {
                return `\`${text}\``;
            }
            return fail('Unsupported Markdown text formatting.');
        })
        .join('');
const serialize = (state: Obj): string => {
    const root = asObject(state.root);
    const children = asArray(root.children);
    if (!children.length) {
        return fail();
    }
    return children
        .map((value) => {
            const node = asObject(value);
            if (node.type === 'code') {
                if (
                    node.language !== undefined &&
                    (typeof node.language !== 'string' || !/^[A-Za-z0-9_+-]+$/.test(node.language))
                ) {
                    return fail();
                }
                const content = asArray(node.children);
                if (
                    content.length !== 1 ||
                    !isObject(content[0]) ||
                    content[0].type !== 'text' ||
                    typeof content[0].text !== 'string'
                ) {
                    return fail();
                }
                const text = content[0].text;
                if (text.includes('```') || text.includes('\r') || hasLoneSurrogate(text)) {
                    return fail();
                }
                return `\`\`\`${node.language ?? ''}\n${text}\n\`\`\``;
            }
            if (node.type === 'list') {
                if (node.listType !== 'bullet' && node.listType !== 'number') {
                    return fail();
                }
                const items = asArray(node.children);
                if (!items.length) {
                    return fail();
                }
                return items
                    .map((item, i) => {
                        const li = asObject(item);
                        if (li.type !== 'listitem') {
                            return fail();
                        }
                        const text = inlineString(asArray(li.children));
                        if (!text) {
                            return fail();
                        }
                        return `${node.listType === 'bullet' ? '-' : `${i + 1}.`} ${text}`;
                    })
                    .join('\n');
            }
            const text = inlineString(asArray(node.children));
            if (!text) {
                return fail();
            }
            if (node.type === 'paragraph') {
                return text;
            }
            if (node.type === 'quote') {
                return `> ${text}`;
            }
            if (node.type === 'heading' && typeof node.tag === 'string' && /^h[1-6]$/.test(node.tag)) {
                return `${'#'.repeat(Number(node.tag[1]))} ${text}`;
            }
            return fail('Unsupported Markdown block.');
        })
        .join('\n\n');
};
const findEnd = (text: string, token: string, start: number): number => {
    for (let i = start; i < text.length; i++) {
        if (text[i] === '\\') {
            i++;
            continue;
        }
        if (text.startsWith(token, i)) {
            return i;
        }
    }
    return fail('Unterminated Markdown token.');
};
const decodeMarkdownEscape = (text: string): string => {
    let out = '';
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\\' && ++i === text.length) {
            return fail('Invalid Markdown escape.');
        }
        out += text[i];
    }
    return out;
};
const inlineNodes = (text: string, budget: JsonBudget, format = 0, depth = 5): Json[] => {
    if (depth > 32 || !lineSafe(text)) {
        return fail('Invalid Markdown inline content.');
    }
    const out: Json[] = [];
    let buffer = '';
    const flush = (): void => {
        if (buffer) {
            out.push(budget.object({ ...TEXT_DEFAULTS, format, text: buffer, type: 'text' }, [], depth));
            buffer = '';
        }
    };
    for (let i = 0; i < text.length; ) {
        if (text[i] === '\\') {
            if (++i === text.length) {
                return fail('Invalid Markdown escape.');
            }
            buffer += text[i++];
            continue;
        }
        if (text[i] === '[') {
            flush();
            const end = findEnd(text, '](', i + 1);
            const urlEnd = findEnd(text, ')', end + 2);
            const children = budget.array(
                inlineNodes(text.slice(i + 1, end), budget, format, depth + 2),
                true,
                depth + 1,
            );
            out.push(
                budget.object(
                    {
                        ...ELEMENT_DEFAULTS,
                        children,
                        rel: null,
                        target: null,
                        title: null,
                        type: 'link',
                        url: decodeMarkdownEscape(text.slice(end + 2, urlEnd)),
                    },
                    ['children'],
                    depth,
                ),
            );
            i = urlEnd + 1;
            continue;
        }
        const token = ['***', '**', '*', '`'].find((t) => text.startsWith(t, i));
        if (token) {
            flush();
            const end = findEnd(text, token, i + token.length);
            const content = text.slice(i + token.length, end);
            if (!content) {
                return fail('Empty Markdown formatting token.');
            }
            if (token === '`') {
                out.push(
                    budget.object(
                        { ...TEXT_DEFAULTS, format: format | 16, text: decodeMarkdownEscape(content), type: 'text' },
                        [],
                        depth,
                    ),
                );
            } else {
                out.push(
                    ...inlineNodes(
                        content,
                        budget,
                        format | (token.length === 3 ? 3 : token.length === 2 ? 1 : 2),
                        depth + 1,
                    ),
                );
            }
            i = end + token.length;
            continue;
        }
        buffer += text[i++];
    }
    flush();
    return out;
};
export const decodeMarkdown = (text: string): Obj => {
    if (!text || hasLoneSurrogate(text) || text.includes('\r')) {
        return fail('Invalid Markdown representation.');
    }
    // At most 6,000 lines; check before allocating split arrays.
    let lines = 1;
    for (const c of text) {
        if (c === '\n' && ++lines > 6000) {
            return fail('Markdown has too many lines.');
        }
    }
    const source = text.split('\n');
    const budget = new JsonBudget();
    const blocks: Json[] = [];
    const inlineBlock = (type: string, content: string, extra: Obj = {}): Obj => {
        const children = budget.array(inlineNodes(content, budget), true, 4);
        if (!children.length) {
            return fail('Empty Markdown block.');
        }
        return budget.object(
            { ...(type === 'paragraph' ? PARAGRAPH_DEFAULTS : ELEMENT_DEFAULTS), ...extra, children, type },
            ['children'],
            3,
        );
    };
    for (let i = 0; i < source.length; ) {
        const line = source[i];
        if (!line) {
            return fail('Unexpected empty Markdown block.');
        }
        if (line.startsWith('```')) {
            const language = line.slice(3);
            if (language && !/^[A-Za-z0-9_+-]+$/.test(language)) {
                return fail();
            }
            const body: string[] = [];
            i++;
            while (i < source.length && source[i] !== '```') {
                body.push(source[i++]);
            }
            if (i === source.length) {
                return fail('Unterminated Markdown code block.');
            }
            const child = budget.object({ ...TEXT_DEFAULTS, text: body.join('\n'), type: 'text' }, [], 5);
            const children = budget.array([child], true, 4);
            blocks.push(
                budget.object(
                    { ...ELEMENT_DEFAULTS, children, type: 'code', ...(language ? { language } : {}) },
                    ['children'],
                    3,
                ),
            );
            i++;
        } else if (/^(?:- |1\. )/.test(line)) {
            const number = line.startsWith('1. ');
            const items: Json[] = [];
            while (i < source.length && source[i]) {
                const prefix = number ? `${items.length + 1}. ` : '- ';
                if (!source[i].startsWith(prefix)) {
                    return fail('Invalid Markdown list sequence.');
                }
                const children = budget.array(inlineNodes(source[i].slice(prefix.length), budget, 0, 7), true, 6);
                if (!children.length) {
                    return fail();
                }
                items.push(
                    budget.object(
                        { ...ELEMENT_DEFAULTS, children, type: 'listitem', value: items.length + 1 },
                        ['children'],
                        5,
                    ),
                );
                i++;
            }
            const children = budget.array(items, true, 4);
            blocks.push(
                budget.object(
                    {
                        ...ELEMENT_DEFAULTS,
                        children,
                        listType: number ? 'number' : 'bullet',
                        start: 1,
                        tag: number ? 'ol' : 'ul',
                        type: 'list',
                    },
                    ['children'],
                    3,
                ),
            );
        } else {
            const heading = /^(#{1,6}) (.+)$/.exec(line);
            blocks.push(
                heading
                    ? inlineBlock('heading', heading[2], { tag: `h${heading[1].length}` })
                    : line.startsWith('> ')
                      ? inlineBlock('quote', line.slice(2))
                      : inlineBlock('paragraph', line),
            );
            i++;
        }
        if (i < source.length) {
            if (source[i] !== '' || i + 1 === source.length) {
                return fail('Invalid Markdown block separator.');
            }
            i++;
        }
    }
    const children = budget.array(blocks, true, 2);
    const root = budget.object({ ...ELEMENT_DEFAULTS, children, type: 'root' }, ['children'], 1);
    const state = budget.object({ root }, ['root']);
    if (serialize(state) !== text) {
        return fail('Non-canonical Markdown representation.');
    }
    return state;
};
export const encodeMarkdown = (state: Obj): string | null => {
    try {
        const text = serialize(state);
        return sameJson(decodeMarkdown(text), state) ? text : null;
    } catch {
        return null;
    }
};
