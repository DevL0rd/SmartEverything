import type { RemoteInfo, Socket } from 'node:dgram';
import type { JsonValue } from '@smarteverything/domain';
import type { PluginNetwork } from '../../plugin-listen';
import { WIZ_FRAME, WizProtocolError, type WizFrame, type WizPorts } from './protocol';

const REQUEST_ATTEMPTS = 3;
const REQUEST_ATTEMPT_MS = 1000;
const ANY_ADDRESS = '0.0.0.0';

type WizParams = Readonly<Record<string, JsonValue>>;

interface TransportOptions {
  readonly ports: WizPorts;
  readonly receive: (frame: WizFrame, address: string) => void;
  readonly failure: (cause: Error) => void;
}

interface Waiting {
  readonly address: string;
  readonly method: string;
  readonly settle: (outcome: WizFrame | Error) => void;
}

function decode(bytes: Buffer): WizFrame | null {
  try {
    const parsed = WIZ_FRAME.safeParse(JSON.parse(bytes.toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch (cause) {
    if (cause instanceof SyntaxError) return null;
    throw cause;
  }
}

export class WizTransport {
  private readonly waiting = new Map<number, Waiting>();
  private requestId = 0;
  private closed = false;

  private constructor(
    private readonly control: Socket,
    private readonly push: Socket,
    private readonly options: TransportOptions,
  ) {
    for (const socket of [control, push]) {
      socket.on('message', this.message);
      socket.on('error', options.failure);
    }
    control.setBroadcast(true);
  }

  static async open(network: PluginNetwork, options: TransportOptions): Promise<WizTransport> {
    const control = await network.listenUdp(options.ports.control, ANY_ADDRESS);
    try {
      return new WizTransport(
        control,
        await network.listenUdp(options.ports.push, ANY_ADDRESS),
        options,
      );
    } catch (cause) {
      control.close();
      throw cause;
    }
  }

  send(address: string, method: string, params: WizParams): Promise<void> {
    return this.write(address, method, params);
  }

  request(address: string, method: string, params: WizParams): Promise<WizFrame> {
    if (this.closed) return Promise.reject(new WizProtocolError(method, 'the plugin has stopped'));
    this.requestId += 1;
    const id = this.requestId;
    return new Promise((resolve, reject) => {
      let attempts = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (outcome: WizFrame | Error): void => {
        clearTimeout(timer);
        this.waiting.delete(id);
        if (outcome instanceof Error) reject(outcome);
        else resolve(outcome);
      };
      const transmit = (): void => {
        if (attempts === REQUEST_ATTEMPTS) {
          settle(new WizProtocolError(method, 'the light did not respond; its outcome is unknown'));
          return;
        }
        attempts += 1;
        timer = setTimeout(transmit, REQUEST_ATTEMPT_MS);
        timer.unref();
        this.write(address, method, params, id).catch(settle);
      };
      this.waiting.set(id, { address, method, settle });
      transmit();
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of [...this.waiting.values()])
      entry.settle(new WizProtocolError(entry.method, 'the plugin has stopped'));
    for (const socket of [this.control, this.push]) {
      socket.off('message', this.message);
      socket.off('error', this.options.failure);
      socket.close();
    }
  }

  private write(address: string, method: string, params: WizParams, id?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.control.send(
        Buffer.from(JSON.stringify({ method, id, params })),
        this.options.ports.control,
        address,
        (cause) => {
          if (cause === null) resolve();
          else reject(new WizProtocolError(method, cause.name));
        },
      );
    });
  }

  private answered(frame: WizFrame, address: string): Waiting | undefined {
    for (const [id, entry] of this.waiting) {
      if (
        entry.address === address &&
        entry.method === frame.method &&
        (frame.id === undefined || frame.id === id)
      )
        return entry;
    }
    return undefined;
  }

  private readonly message = (bytes: Buffer, remote: RemoteInfo): void => {
    const frame = decode(bytes);
    if (frame === null) return;
    const entry = this.answered(frame, remote.address);
    if (frame.error === undefined) entry?.settle(frame);
    else entry?.settle(new WizProtocolError(frame.method, 'the light rejected the request'));
    this.options.receive(frame, remote.address);
  };
}
