import type { RemoteInfo, Socket } from 'node:dgram';
import type { JsonValue } from '@smarteverything/domain';
import { WIZ_CONTROL_PORT, WizProtocolError, type WizFrame } from './protocol';

const REQUEST_TIMEOUT_MS = 3000;
export interface WizRequest {
  readonly address: string;
  readonly method: string;
  readonly params: Readonly<Record<string, JsonValue>>;
  readonly id: number;
}
interface ExchangeOptions {
  readonly decode: (bytes: Buffer, remote: RemoteInfo) => WizFrame | null;
  readonly receive: (frame: WizFrame, address: string) => void;
}
interface Completion {
  readonly resolve: (frame: WizFrame) => void;
  readonly reject: (cause: Error) => void;
}
export class WizExchange {
  private completion: Completion | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private socketClosed = false;
  constructor(
    private readonly socket: Socket,
    private readonly request: WizRequest,
    private readonly options: ExchangeOptions,
  ) {}
  run(): Promise<WizFrame> {
    return new Promise((resolve, reject) => {
      this.completion = { resolve, reject };
      this.socket.on('message', this.message);
      this.socket.once('error', this.error);
      this.socket.once('close', this.close);
      this.timer = setTimeout(() => {
        this.finish(
          null,
          new WizProtocolError(
            this.request.method,
            'the light did not respond within three seconds; its outcome is unknown',
          ),
        );
      }, REQUEST_TIMEOUT_MS);
      this.timer.unref();
      this.send();
    });
  }
  cancel(): void {
    this.finish(null, new WizProtocolError(this.request.method, 'the plugin has stopped'));
  }
  private send(): void {
    try {
      const { method, id, params } = this.request;
      this.socket.send(Buffer.from(JSON.stringify({ method, id, params })), (cause) => {
        if (cause !== null) this.error(cause);
      });
    } catch (cause) {
      this.error(
        cause instanceof Error
          ? cause
          : new WizProtocolError(this.request.method, 'sending the request failed'),
      );
    }
  }
  private finish(frame: WizFrame | null, cause: Error | null): void {
    const completion = this.completion;
    if (completion === null) return;
    this.completion = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.socket.off('message', this.message);
    this.socket.off('error', this.error);
    this.socket.off('close', this.close);
    if (!this.socketClosed) this.socket.close();
    if (cause !== null) completion.reject(cause);
    else if (frame !== null) completion.resolve(frame);
  }
  private readonly error = (cause: Error): void => {
    this.finish(null, new WizProtocolError(this.request.method, cause.name));
  };
  private readonly close = (): void => {
    this.socketClosed = true;
    this.finish(null, new WizProtocolError(this.request.method, 'the command socket closed'));
  };
  private readonly message = (bytes: Buffer, remote: RemoteInfo): void => {
    if (remote.address !== this.request.address || remote.port !== WIZ_CONTROL_PORT) return;
    const frame = this.options.decode(bytes, remote);
    if (frame === null) return;
    if (frame.method !== this.request.method) {
      this.options.receive(frame, remote.address);
      return;
    }
    if (frame.id !== undefined && frame.id !== this.request.id) return;
    if (frame.error !== undefined)
      this.finish(
        null,
        new WizProtocolError(this.request.method, 'the light rejected the request'),
      );
    else {
      this.options.receive(frame, remote.address);
      this.finish(frame, null);
    }
  };
}
