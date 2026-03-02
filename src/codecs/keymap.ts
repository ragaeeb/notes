const KEY_MAP = {
    children: 'c',
    detail: 'dt',
    direction: 'd',
    format: 'f',
    indent: 'i',
    language: 'la',
    listType: 'lt',
    mode: 'm',
    rel: 'rl',
    root: 'r',
    start: 's',
    style: 'st',
    tag: 'tg',
    target: 'tr',
    text: 'tx',
    title: 'ti',
    type: 't',
    url: 'u',
    value: 'vl',
    version: 'v',
} as const;

const REVERSE_KEY_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(KEY_MAP).map(([full, minified]) => [minified, full]),
);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const renameKeysDeep = (value: unknown, map: Record<string, string>): unknown => {
    if (Array.isArray(value)) {
        return value.map((item) => renameKeysDeep(item, map));
    }

    if (!isPlainObject(value)) {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => {
            const renamedKey = map[key] ?? key;
            return [renamedKey, renameKeysDeep(nestedValue, map)];
        }),
    );
};

export const minifyKeys = <T>(value: T): T => {
    return renameKeysDeep(value, KEY_MAP as Record<string, string>) as T;
};

export const expandKeys = <T>(value: T): T => {
    return renameKeysDeep(value, REVERSE_KEY_MAP) as T;
};

export { KEY_MAP };
