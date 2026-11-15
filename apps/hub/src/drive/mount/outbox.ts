import { FRAME_FLAGS } from '@smarteverything/domain/drive-mount';

const FLAGS_OFFSET = 2;

export interface Wire {
  readonly send: (bytes: Uint8Array, written: (failure?: Error | null) => void) => void;
}

export function carriesPayload(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (view.getUint16(FLAGS_OFFSET, true) & FRAME_FLAGS.payload) !== 0;
}

export class Outbox {
  private readonly control: Uint8Array[] = [];
  private readonly bulk: Uint8Array[] = [];
  private inflight = 0;
  private stopped = false;

  constructor(
    private readonly wire: Wire,
    private readonly failed: (failure: Error) => void,
    private readonly window: number,
  ) {}

  send(bytes: Uint8Array): void {
    if (this.stopped) return;
    if (carriesPayload(bytes)) this.bulk.push(bytes);
    else this.control.push(bytes);
    this.pump();
  }

  get queued(): number {
    return this.control.length + this.bulk.length;
  }

  stop(): void {
    this.stopped = true;
    this.control.length = 0;
    this.bulk.length = 0;
  }

  private next(): Uint8Array | undefined {
    if (this.control.length > 0) return this.control.shift();
    return this.bulk.shift();
  }

  private pump(): void {
    while (!this.stopped && this.inflight < this.window) {
      const bytes = this.next();
      if (bytes === undefined) return;
      this.inflight += bytes.byteLength;
      this.wire.send(bytes, (failure) => {
        this.inflight -= bytes.byteLength;
        if (failure instanceof Error) {
          if (!this.stopped) this.failed(failure);
          this.stop();
          return;
        }
        this.pump();
      });
    }
  }
}
