// Offline CORE-ONLY typecheck declarations. These are NOT app dependency replacements
// and are not included by tsconfig.app.json. Full installed-dependency checking is required.
declare module 'lexical' { export type SerializedEditorState = { root: Record<string, unknown> }; }
declare module 'brotli-wasm' { const promise: Promise<unknown>; export default promise; }
interface ImportMeta { readonly env?: Record<string, string | boolean | undefined>; }
