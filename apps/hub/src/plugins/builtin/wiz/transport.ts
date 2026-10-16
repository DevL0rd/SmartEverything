import { randomInt } from 'node:crypto';
import type { RemoteInfo, Socket } from 'node:dgram';
import type { JsonValue } from '@smarteverything/domain';
import { WizExchange } from './exchange';
import type { PluginNetwork } from '../../plugin-listen';
import {
  WIZ_CONTROL_PORT,
  WIZ_FRAME,
  WIZ_PUSH_PORT,
  WizProtocolError,
  type WizFrame,
} from './protocol';

const MAX_PACKET_BYTES = 8192;
const MAX_REQUEST_ID = 2_147_483_647;
interface TransportOptions {
  readonly network: PluginNetwork;
  readonly receive: (frame: WizFrame, address: string) => void;
  readonly failure: (cause: Error) => void;
  readonly accept: (address: string) => boolean;
}
export class WizTransport {
  private readonly pending = new Set<WizExchange>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private closed = false;
  private requestId = randomInt(1, MAX_REQUEST_ID);
  private constructor(
    private readonly control: Socket,
    private readonly push: Socket,
    private readonly options: TransportOptions,
  ) {
    control.on('message', this.message);
    push.on('message', this.message);
    control.on('error', options.failure);
    push.on('error', options.failure);
    control.setBroadcast(true);
  }
  static async open(
    network: PluginNetwork,
    receive: TransportOptions['receive'],
    failure: TransportOptions['failure'],
    accept: TransportOptions['accept'],
  ): Promise<WizTransport> {
    const control = await network.listenUdp(WIZ_CONTROL_PORT, '0.0.0.0');
    try {
      const push = await network.listenUdp(WIZ_PUSH_PORT, '0.0.0.0');
      return new WizTransport(control, push, { network, receive, failure, accept });
    } catch (cause) {
      control.close();
      throw cause;
    }
  }
  send(
    address: string,
    method: string,
    params: Readonly<Record<string, JsonValue>>,
  ): Promise<void> {
    if (this.closed) return Promise.reject(new WizProtocolError(method, 'the plugin has stopped'));
    return new Promise((resolve, reject) => {
      this.control.send(
        Buffer.from(JSON.stringify({ method, params })),
        WIZ_CONTROL_PORT,
        address,
        (cause) => {
          if (cause === null) resolve();
          else reject(new WizProtocolError(method, cause.name));
        },
      );
    });
  }
  request(
    address: string,
    method: string,
    params: Readonly<Record<string, JsonValue>>,
  ): Promise<WizFrame> {
    const previous = this.queues.get(address) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.exchange(address, method, params));
    this.queues.set(address, next);
    void next
      .finally(() => {
        if (this.queues.get(address) === next) this.queues.delete(address);
      })
      .catch(() => undefined);
    return next;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending) pending.cancel();
    for (const socket of [this.control, this.push]) {
      socket.off('message', this.message);
      socket.off('error', this.options.failure);
      socket.close();
    }
  }
  private async exchange(
    address: string,
    method: string,
    params: Readonly<Record<string, JsonValue>>,
  ): Promise<WizFrame> {
    if (this.closed) throw new WizProtocolError(method, 'the plugin has stopped');
    const socket = await this.options.network.connectUdp(WIZ_CONTROL_PORT, address);
    if (this.inactive()) {
      socket.close();
      throw new WizProtocolError(method, 'the plugin has stopped');
    }
    this.requestId = this.requestId === MAX_REQUEST_ID ? 1 : this.requestId + 1;
    const exchange = new WizExchange(
      socket,
      { address, method, params, id: this.requestId },
      {
        decode: (bytes, remote): WizFrame | null => this.decode(bytes, remote),
        receive: this.options.receive,
      },
    );
    this.pending.add(exchange);
    return exchange.run().finally(() => {
      this.pending.delete(exchange);
    });
  }
  private inactive(): boolean {
    return this.closed;
  }
  private decode(bytes: Buffer, remote: RemoteInfo): WizFrame | null {
    if (this.closed || bytes.length > MAX_PACKET_BYTES || !this.options.accept(remote.address))
      return null;
    let raw: unknown;
    try {
      raw = JSON.parse(bytes.toString('utf8'));
    } catch (cause) {
      if (!(cause instanceof SyntaxError))
        this.options.failure(
          new WizProtocolError('decode', 'an incoming datagram could not be decoded'),
        );
      return null;
    }
    const parsed = WIZ_FRAME.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
  private readonly message = (bytes: Buffer, remote: RemoteInfo): void => {
    const frame = this.decode(bytes, remote);
    if (frame !== null) this.options.receive(frame, remote.address);
  };
}
