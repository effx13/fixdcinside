/** Wrangler compiles `.wasm` imports into a WebAssembly.Module at build time. */
declare module '*.wasm' {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}

/**
 * wasm-bindgen ships a .d.ts next to this file describing the module's exports
 * rather than the module itself, which would otherwise win over the pattern
 * above and leave the import with no default.
 */
declare module '@jsquash/png/codec/pkg/squoosh_png_bg.wasm' {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}

/**
 * The image codecs type their input and output as the DOM's ImageData, which
 * is not part of the Workers type surface. Declaring the shape here keeps the
 * codec calls typed instead of casting at every call site.
 */
interface ImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace?: string;
}
