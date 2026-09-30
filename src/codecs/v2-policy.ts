// Encoding policy only: changing this schedule must NEVER change any reader or tag.
// Frozen using the supplemental development set BEFORE evaluation scoring. Native
// Brotli measurements are provisional; real WASM/mobile qualification remains gated.
import type { Mode } from './v2-constants';
export const POLICY_ID = 'native-development-2026-09-30-r1';
export const SHIPPING_COMPRESSED_PAIRS = Object.freeze([
    'text/utf8/brotli/11',
    'text/window8/brotli/4',
    'split/utf8/brotli/4',
    'text/utf8/cm/0',
    'tuples/utf8/cm/0',
    'markdown/utf8/cm/0',
]);
export const isShippingCandidate = (mode: Mode, quality: number, plainEligible: boolean): boolean => {
    // Cheap raw and native-deflate alternatives remain for every representation,
    // including window8, even when WASM/CM is unavailable or metadata is unusual.
    if (mode.compression === 'raw' || mode.compression === 'deflate') {
        return true;
    }
    // No development plain document needed a second structurally framed CM pass.
    // Split-text Brotli remains: it uniquely won on 100 high-entropy text runs.
    if (plainEligible && mode.compression === 'cm' && mode.representation !== 'text') {
        return false;
    }
    return SHIPPING_COMPRESSED_PAIRS.includes(
        `${mode.representation}/${mode.unicode}/${mode.compression}/${mode.compression === 'brotli' ? quality : 0}`,
    );
};
