declare global {
  class MediaStreamTrackProcessor<T extends AudioData | VideoFrame> {
    constructor(init: { readonly track: MediaStreamTrack });
    readonly readable: ReadableStream<T>;
  }
}

export {};
