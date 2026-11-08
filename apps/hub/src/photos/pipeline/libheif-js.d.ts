declare module 'libheif-js/wasm-bundle' {
  export interface HeifPixels {
    readonly data: Uint8ClampedArray<ArrayBuffer>;
    readonly width: number;
    readonly height: number;
  }

  export interface HeifImage {
    readonly get_width: () => number;
    readonly get_height: () => number;
    readonly is_primary: () => boolean;
    readonly display: (target: HeifPixels, done: (result: HeifPixels | null) => void) => void;
  }

  export class HeifDecoder {
    decode(bytes: Uint8Array): HeifImage[];
  }
}
