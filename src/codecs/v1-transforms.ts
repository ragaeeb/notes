import {
    BARE_NODE_DEFAULTS,
    BARE_TYPES,
    ELEMENT_NODE_DEFAULTS,
    REVERSE_VALUE_MAP,
    TEXT_NODE_DEFAULTS,
    TEXT_TYPES,
    VALUE_MAP,
} from './v1-constants';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const getNodeType = (obj: Record<string, unknown>): string | undefined => {
    if (typeof obj.type === 'string') {
        return obj.type;
    }
    if (typeof obj.t === 'string') {
        return obj.t;
    }
    return undefined;
};

const getDefaultsForType = (nodeType: string): Record<string, unknown> => {
    if (TEXT_TYPES.has(nodeType)) {
        return TEXT_NODE_DEFAULTS;
    }
    if (BARE_TYPES.has(nodeType)) {
        return BARE_NODE_DEFAULTS;
    }
    return ELEMENT_NODE_DEFAULTS;
};

// ---- Strip defaults (encode path) ----

const stripNodeDefaults = (
    obj: Record<string, unknown>,
    defaults: Record<string, unknown>,
): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
        if (key in defaults && val === defaults[key]) {
            continue;
        }
        out[key] = stripDefaultsDeep(val);
    }
    return out;
};

const stripDefaultsDeep = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(stripDefaultsDeep);
    }
    if (!isPlainObject(value)) {
        return value;
    }

    const nodeType = getNodeType(value);
    if (nodeType !== undefined) {
        return stripNodeDefaults(value, getDefaultsForType(nodeType));
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = stripDefaultsDeep(v);
    }
    return out;
};

export const stripDefaults = <T>(value: T): T => stripDefaultsDeep(value) as T;

// ---- Restore defaults (decode path) ----

const restoreNodeDefaults = (
    obj: Record<string, unknown>,
    defaults: Record<string, unknown>,
): Record<string, unknown> => {
    const restored: Record<string, unknown> = {};

    for (const [key, def] of Object.entries(defaults)) {
        restored[key] = key in obj ? restoreDefaultsDeep(obj[key]) : def;
    }

    for (const [key, val] of Object.entries(obj)) {
        if (!(key in restored)) {
            restored[key] = restoreDefaultsDeep(val);
        }
    }

    return restored;
};

const restoreDefaultsDeep = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(restoreDefaultsDeep);
    }
    if (!isPlainObject(value)) {
        return value;
    }

    const nodeType = getNodeType(value);
    if (nodeType !== undefined) {
        return restoreNodeDefaults(value, getDefaultsForType(nodeType));
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = restoreDefaultsDeep(v);
    }
    return out;
};

export const restoreDefaults = <T>(value: T): T => restoreDefaultsDeep(value) as T;

// ---- Value minification (encode path, runs AFTER key minification) ----

const minifyValuesDeep = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(minifyValuesDeep);
    }
    if (!isPlainObject(value)) {
        return value;
    }

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
        let mapped = minifyValuesDeep(val);
        const fieldMap = VALUE_MAP[key];
        if (fieldMap && typeof mapped === 'string' && mapped in fieldMap) {
            mapped = fieldMap[mapped];
        }
        out[key] = mapped;
    }
    return out;
};

export const minifyValues = <T>(value: T): T => minifyValuesDeep(value) as T;

// ---- Value expansion (decode path, runs BEFORE key expansion) ----

const expandValuesDeep = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(expandValuesDeep);
    }
    if (!isPlainObject(value)) {
        return value;
    }

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
        let mapped = expandValuesDeep(val);
        const reverseMap = REVERSE_VALUE_MAP[key];
        if (reverseMap && typeof mapped === 'string' && mapped in reverseMap) {
            mapped = reverseMap[mapped];
        }
        out[key] = mapped;
    }
    return out;
};

export const expandValues = <T>(value: T): T => expandValuesDeep(value) as T;
