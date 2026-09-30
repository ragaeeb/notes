import type { CodecVersion } from './types';
import { CM_QUALIFIED, RELEASE_QUALIFIED } from './v2-constants';
// Qualification opt-ins only; default stays v1 until release gates pass.
export const WRITER_VERSION: CodecVersion =
    RELEASE_QUALIFIED || import.meta.env?.VITE_ENABLE_V2 === 'true' ? 'v2' : 'v1';
export const ENABLE_CM = CM_QUALIFIED || import.meta.env?.VITE_ENABLE_CM_EXPERIMENTAL === 'true';
