export interface VideoFrame {
  readonly data: Buffer;
  readonly mimeType: 'image/jpeg';
}

export interface VideoSource {
  readonly onFrame: (listener: (frame: VideoFrame) => void) => () => void;
}

export class NoSuchCallError extends Error {
  override readonly name = 'NoSuchCallError';

  constructor(callId: string) {
    super(`There is no assistant call ${callId} to attach to.`);
  }
}
