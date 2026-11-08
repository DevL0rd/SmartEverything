import { randomUUID } from 'node:crypto';
import type { HubFrame, RelayHeaders, RelayNodeFrame } from '@smarteverything/domain';

export interface RelayRequest {
  readonly port: number;
  readonly method: string;
  readonly path: string;
  readonly headers: RelayHeaders;
  readonly websocket: boolean;
}

export interface RelayListener {
  readonly head: (status: number, headers: RelayHeaders) => void;
  readonly data: (chunk: Buffer, text: boolean) => void;
  readonly end: () => void;
  readonly failed: (reason: string) => void;
}

export interface RelayStream {
  readonly data: (chunk: Buffer, text: boolean) => void;
  readonly end: () => void;
  readonly close: () => void;
}

export class RelayStreams {
  private readonly open = new Map<string, RelayListener>();

  constructor(private readonly send: (frame: HubFrame) => void) {}

  start(request: RelayRequest, listener: RelayListener): RelayStream {
    const stream = randomUUID();
    this.open.set(stream, listener);
    this.send({ type: 'relay_open', stream, ...request });
    return {
      data: (chunk, text): void => {
        if (this.open.has(stream))
          this.send({ type: 'relay_data', stream, data: chunk.toString('base64'), text });
      },
      end: (): void => {
        if (this.open.has(stream)) this.send({ type: 'relay_end', stream });
      },
      close: (): void => {
        if (this.open.delete(stream)) this.send({ type: 'relay_close', stream });
      },
    };
  }

  receive(frame: RelayNodeFrame): boolean {
    const listener = this.open.get(frame.stream);
    if (listener === undefined) return false;
    switch (frame.type) {
      case 'relay_head':
        listener.head(frame.status, frame.headers);
        return true;
      case 'relay_data':
        listener.data(Buffer.from(frame.data, 'base64'), frame.text);
        return true;
      case 'relay_end':
        this.open.delete(frame.stream);
        listener.end();
        return true;
      case 'relay_failed':
        this.open.delete(frame.stream);
        listener.failed(frame.reason);
        return true;
    }
  }

  close(): void {
    const listeners = [...this.open.values()];
    this.open.clear();
    listeners.forEach((listener) => {
      listener.failed('The computer disconnected.');
    });
  }
}
