import { createSocket, type Socket } from 'node:dgram';
import { once } from 'node:events';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { decodeMessage, encodeMessage, parseToken } from '@smarteverything/xiaomi';
import { z } from 'zod';

const REQUEST = z.object({ id: z.number().int(), method: z.string(), params: JSON_VALUE });
const ADDRESS = z.object({
  siid: z.number().int(),
  piid: z.number().int(),
  value: JSON_VALUE.optional(),
});
const SUBSCRIPTION = z.object({ update_ts: z.number().int() });
const ACTION = z.object({
  siid: z.number().int(),
  aiid: z.number().int(),
  in: z.array(JSON_VALUE),
});

export interface FakeDeviceOptions {
  readonly host: string;
  readonly deviceId: number;
  readonly token: string;
  readonly properties: Readonly<Record<string, JsonValue>>;
  readonly port?: number;
}

export interface ReceivedRequest {
  readonly method: string;
  readonly params: JsonValue;
  readonly stamp: number;
}

export class FakeMiioDevice {
  readonly requests: ReceivedRequest[] = [];
  readonly actions: {
    readonly siid: number;
    readonly aiid: number;
    readonly inputs: JsonValue[];
  }[] = [];
  readonly properties: Map<string, JsonValue>;
  readonly acks: string[] = [];
  readonly subscriptions: string[] = [];
  handshakes = 0;
  silent = false;
  offersPush = false;
  replyDelayMs = 0;
  rejectsSeenIds = false;
  dropsReads = false;
  pushAfterWriteMs: number | null = null;
  private readonly seenIds = new Set<number>();
  private pushId = 1000;
  private subscribedAt = 0;
  private readonly socket: Socket = createSocket('udp4');
  private readonly token: Uint8Array;
  private readonly stamp = 1000;
  private peer: { readonly host: string; readonly port: number } | null = null;

  constructor(private readonly options: FakeDeviceOptions) {
    this.token = parseToken(options.token);
    this.properties = new Map(Object.entries(options.properties));
    this.socket.on('message', (packet, sender) => {
      if (!this.silent) {
        this.answer(new Uint8Array(packet), sender.address, sender.port);
      }
    });
  }

  async start(): Promise<number> {
    this.socket.bind(this.options.port ?? 0, this.options.host);
    await once(this.socket, 'listening');
    return this.socket.address().port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.socket.close(() => {
        resolve();
      });
    });
  }

  pushProperties(changes: readonly { siid: number; piid: number; value: JsonValue }[]): void {
    this.pushId += 1;
    this.push(
      JSON.stringify({
        id: this.pushId,
        method: 'properties_changed',
        params: changes.map((change) => ({ did: String(this.options.deviceId), ...change })),
      }),
    );
  }

  push(body: string): void {
    if (this.peer === null) {
      throw new Error('no client has contacted the fake device yet');
    }
    const header = { deviceId: this.options.deviceId, stamp: this.stamp + 2 };
    this.socket.send(encodeMessage(this.token, header, body), this.peer.port, this.peer.host);
  }

  private answer(packet: Uint8Array, host: string, port: number): void {
    this.peer = { host, port };
    if (packet.length === 32) {
      this.handshakes += 1;
      const reply = new Uint8Array(32).fill(0xff);
      const view = new DataView(reply.buffer);
      view.setUint16(0, 0x2131);
      view.setUint16(2, 32);
      view.setUint32(4, 0);
      view.setUint32(8, this.options.deviceId);
      view.setUint32(12, this.stamp);
      if (this.offersPush && Buffer.from(packet.subarray(16, 20)).toString() === 'MDID') {
        reply.set(Buffer.from('MSUB'), 16);
        view.setUint32(20, this.subscribedAt);
        reply.set(Buffer.from('PUB'), 24);
        view.setUint8(27, this.subscribedAt === 0 ? 0 : 2);
        view.setUint8(28, 0xfe);
      }
      this.socket.send(reply, port, host);
      return;
    }
    const message = decodeMessage(this.token, packet);
    const parsed = REQUEST.safeParse(JSON.parse(message.body));
    if (!parsed.success) {
      this.acks.push(message.body);
      return;
    }
    const request = parsed.data;
    if (this.ignores(request)) {
      return;
    }
    this.requests.push({
      method: request.method,
      params: request.params,
      stamp: message.header.stamp,
    });
    const body = JSON.stringify({ id: request.id, ...this.handle(request.method, request.params) });
    const header = { deviceId: this.options.deviceId, stamp: this.stamp + 1 };
    const reply = encodeMessage(this.token, header, body);
    const delay = this.replyDelayMs;
    if (delay === 0) {
      this.socket.send(reply, port, host);
      return;
    }
    setTimeout(() => {
      this.socket.send(reply, port, host);
    }, delay);
  }

  forgetSubscription(): void {
    this.subscribedAt = 0;
  }

  private ignores(request: { readonly id: number; readonly method: string }): boolean {
    if (this.dropsReads && request.method === 'get_properties') {
      return true;
    }
    if (!this.rejectsSeenIds || request.method.startsWith('miIO.')) {
      return false;
    }
    const seen = this.seenIds.has(request.id);
    this.seenIds.add(request.id);
    return seen;
  }

  private pushWrite(change: { siid: number; piid: number; value: JsonValue }): void {
    const delay = this.pushAfterWriteMs;
    if (delay === null || this.subscribedAt === 0) {
      return;
    }
    setTimeout(() => {
      this.pushProperties([change]);
    }, delay);
  }

  private handle(method: string, params: JsonValue): Record<string, JsonValue> {
    switch (method) {
      case 'get_properties':
        return {
          result: z
            .array(ADDRESS)
            .parse(params)
            .map(({ siid, piid }) => {
              const value = this.properties.get(`${String(siid)}.${String(piid)}`);
              return value === undefined
                ? { siid, piid, code: -4004 }
                : { siid, piid, code: 0, value };
            }),
        };
      case 'set_properties':
        return {
          result: z
            .array(ADDRESS)
            .parse(params)
            .map(({ siid, piid, value }) => {
              this.properties.set(`${String(siid)}.${String(piid)}`, value ?? null);
              this.pushWrite({ siid, piid, value: value ?? null });
              return { siid, piid, code: 0 };
            }),
        };
      case 'miIO.sub':
        this.subscriptions.push(JSON.stringify(params));
        this.subscribedAt = Math.max(1, SUBSCRIPTION.parse(params).update_ts);
        return { result: { code: 0 } };
      case 'miIO.unsub':
        this.subscribedAt = 0;
        return { result: { code: 0 } };
      case 'action': {
        const action = ACTION.parse(params);
        this.actions.push({ siid: action.siid, aiid: action.aiid, inputs: action.in });
        return { result: { code: 0, out: [] } };
      }
      case 'set_motor':
        return { result: ['ok'] };
      default:
        return { error: { code: -9999, message: `unknown method ${method}` } };
    }
  }
}
