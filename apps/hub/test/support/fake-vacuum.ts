import { createSocket, type Socket } from 'node:dgram';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import {
  actionSafety,
  decodeMessage,
  encodeMessage,
  findAction,
  findProperty,
  parseToken,
} from '@smarteverything/xiaomi';
import { z } from 'zod';
import { actionChanges, type VacuumChange } from './fake-vacuum-actions';

const FIXTURES = new URL('../../../../packages/xiaomi/test/fixtures/vacuum/', import.meta.url);

const REQUEST = z.object({ id: z.number().int(), method: z.string(), params: JSON_VALUE });
const SUBSCRIPTION = z.object({ update_ts: z.number().int() });
const ADDRESS = z.object({
  siid: z.number().int(),
  piid: z.number().int(),
  value: JSON_VALUE.optional(),
});
const ACTION = z.object({
  siid: z.number().int(),
  aiid: z.number().int(),
  in: z.array(JSON_VALUE),
});
const EVENT_ARGUMENT = z.object({ piid: z.number().int(), value: JSON_VALUE });
const PROPERTY_ENTRY = z.object({
  tMs: z.number(),
  siid: z.number().int(),
  piid: z.number().int(),
  value: JSON_VALUE,
});
const EVENT_ENTRY = z.object({
  tMs: z.number(),
  siid: z.number().int(),
  eiid: z.number().int(),
  arguments: z.array(EVENT_ARGUMENT),
});
const TIMELINE = z.array(z.union([PROPERTY_ENTRY, EVENT_ENTRY]));
const PUSHES = z.object({ properties: z.array(PROPERTY_ENTRY), events: z.array(EVENT_ENTRY) });
const READINGS = z.array(
  z.object({ siid: z.number().int(), piid: z.number().int(), value: JSON_VALUE }),
);
const ACTION_RESULTS = z.array(
  z.object({
    siid: z.number().int(),
    aiid: z.number().int(),
    code: z.number().int(),
    out: z.array(JSON_VALUE),
  }),
);

const UNKNOWN_ADDRESS = -4004;
const READ_ONLY_PROPERTY = -4002;
const STAMP = 1000;
const HEADER_BYTES = 32;

export type TimelineEntry = z.infer<typeof PROPERTY_ENTRY> | z.infer<typeof EVENT_ENTRY>;
export type ActionOutcome = 'changed' | 'no-effect' | 'refused' | 'unknown';

export interface VacuumIdentity {
  readonly did: string;
  readonly uid: string;
}

export interface FakeVacuumOptions extends VacuumIdentity {
  readonly host: string;
  readonly deviceId: number;
  readonly token: string;
  readonly port?: number;
}

export interface ReceivedRequest {
  readonly method: string;
  readonly params: JsonValue;
}

export interface ReceivedAction {
  readonly siid: number;
  readonly aiid: number;
  readonly inputs: readonly JsonValue[];
  readonly outcome: ActionOutcome;
}

interface Handled {
  readonly body: Record<string, JsonValue>;
  readonly changes: readonly VacuumChange[];
}

export function readVacuumFixture<T>(path: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(new URL(path, FIXTURES), 'utf8')));
}

export function vacuumObjectName(identity: VacuumIdentity, slot: number): string {
  return `${identity.uid}/${identity.did}/${String(slot)}`;
}

function personalise(value: JsonValue, identity: VacuumIdentity): JsonValue {
  return typeof value === 'string'
    ? value.replaceAll('{uid}', identity.uid).replaceAll('{did}', identity.did)
    : value;
}

function addressOf(siid: number, id: number): string {
  return `${String(siid)}.${String(id)}`;
}

function refusal(message: string): Handled {
  return { body: { error: { code: -9999, message } }, changes: [] };
}

function pushesTimeline(): readonly TimelineEntry[] {
  const pushes = readVacuumFixture('pv11gl-pushes.json', PUSHES);
  return [...pushes.properties, ...pushes.events].toSorted((a, b) => a.tMs - b.tMs);
}

export class FakeVacuum {
  readonly requests: ReceivedRequest[] = [];
  readonly actions: ReceivedAction[] = [];
  readonly writes: VacuumChange[] = [];
  readonly acks: string[] = [];
  readonly properties = new Map<string, JsonValue>();
  readonly outputs = new Map<string, readonly JsonValue[]>();
  handshakes = 0;
  silent = false;
  offersPush = false;
  private subscribedAt = 0;
  private readonly socket: Socket = createSocket('udp4');
  private readonly token: Uint8Array;
  private nextPush = 1;
  private peer: { readonly host: string; readonly port: number } | null = null;

  constructor(private readonly options: FakeVacuumOptions) {
    this.token = parseToken(options.token);
    for (const reading of readVacuumFixture('pv11gl-readings.json', READINGS)) {
      this.properties.set(
        addressOf(reading.siid, reading.piid),
        personalise(reading.value, options),
      );
    }
    for (const result of readVacuumFixture('pv11gl-action-results.json', ACTION_RESULTS)) {
      if (result.code === 0 && !this.outputs.has(addressOf(result.siid, result.aiid))) {
        this.outputs.set(addressOf(result.siid, result.aiid), result.out);
      }
    }
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

  setActionOutput(siid: number, aiid: number, out: readonly JsonValue[]): void {
    this.outputs.set(addressOf(siid, aiid), out);
  }

  pushProperties(changes: readonly VacuumChange[]): void {
    for (const change of changes) {
      this.properties.set(addressOf(change.siid, change.piid), change.value);
    }
    this.send({
      id: this.nextPush++,
      method: 'properties_changed',
      params: changes.map((change) => ({ did: this.options.did, ...change })),
    });
  }

  pushEvent(
    siid: number,
    eiid: number,
    args: readonly z.infer<typeof EVENT_ARGUMENT>[] = [],
  ): void {
    this.send({
      id: this.nextPush++,
      method: 'event_occured',
      params: { did: this.options.did, siid, eiid, arguments: args },
    });
  }

  replayPushes(): number {
    return this.replay(pushesTimeline());
  }

  replayStatusTimeline(): number {
    return this.replay(readVacuumFixture('pv11gl-status-timeline.json', TIMELINE));
  }

  replay(entries: readonly TimelineEntry[]): number {
    let batch: VacuumChange[] = [];
    let batchStamp = -1;
    let sent = 0;
    const flush = (): void => {
      if (batch.length > 0) {
        this.pushProperties(batch);
        sent += 1;
        batch = [];
      }
    };
    for (const entry of entries) {
      if ('eiid' in entry) {
        flush();
        this.pushEvent(entry.siid, entry.eiid, entry.arguments);
        sent += 1;
        continue;
      }
      if (entry.tMs !== batchStamp) {
        flush();
      }
      batchStamp = entry.tMs;
      batch.push({ siid: entry.siid, piid: entry.piid, value: entry.value });
    }
    flush();
    return sent;
  }

  private send(body: JsonValue): void {
    if (this.peer === null) {
      throw new Error('no client has contacted the fake vacuum yet');
    }
    const header = { deviceId: this.options.deviceId, stamp: STAMP + 2 };
    this.socket.send(
      encodeMessage(this.token, header, JSON.stringify(body)),
      this.peer.port,
      this.peer.host,
    );
  }

  private answer(packet: Uint8Array, host: string, port: number): void {
    this.peer = { host, port };
    if (packet.length === HEADER_BYTES) {
      this.handshake(host, port, packet);
      return;
    }
    const message = decodeMessage(this.token, packet);
    const parsed = REQUEST.safeParse(JSON.parse(message.body));
    if (!parsed.success) {
      this.acks.push(message.body);
      return;
    }
    const request = parsed.data;
    this.requests.push({ method: request.method, params: request.params });
    const handled = this.handle(request.method, request.params);
    const body = JSON.stringify({ id: request.id, ...handled.body });
    const header = { deviceId: this.options.deviceId, stamp: STAMP + 1 };
    this.socket.send(encodeMessage(this.token, header, body), port, host);
    const changed = handled.changes.filter(
      (change) =>
        JSON.stringify(this.properties.get(addressOf(change.siid, change.piid))) !==
        JSON.stringify(change.value),
    );
    if (changed.length > 0) {
      this.pushProperties(changed);
    }
  }

  private handshake(host: string, port: number, packet: Uint8Array): void {
    this.handshakes += 1;
    const reply = new Uint8Array(HEADER_BYTES).fill(0xff);
    const view = new DataView(reply.buffer);
    view.setUint16(0, 0x2131);
    view.setUint16(2, HEADER_BYTES);
    view.setUint32(4, 0);
    view.setUint32(8, this.options.deviceId);
    view.setUint32(12, STAMP);
    if (this.offersPush && Buffer.from(packet.subarray(16, 20)).toString() === 'MDID') {
      reply.set(Buffer.from('MSUB'), 16);
      view.setUint32(20, this.subscribedAt);
      reply.set(Buffer.from('PUB'), 24);
      view.setUint8(27, this.subscribedAt === 0 ? 0 : 2);
      view.setUint8(28, 0xfe);
    }
    this.socket.send(reply, port, host);
  }

  private handle(method: string, params: JsonValue): Handled {
    switch (method) {
      case 'get_properties':
        return { body: { result: this.read(params) }, changes: [] };
      case 'set_properties':
        return this.write(params);
      case 'action':
        return this.act(params);
      case 'miIO.sub':
        this.subscribedAt = Math.max(1, SUBSCRIPTION.parse(params).update_ts);
        return { body: { result: { code: 0 } }, changes: [] };
      case 'miIO.unsub':
        this.subscribedAt = 0;
        return { body: { result: { code: 0 } }, changes: [] };
      default:
        return refusal(`unknown method ${method}`);
    }
  }

  private read(params: JsonValue): JsonValue {
    return z
      .array(ADDRESS)
      .parse(params)
      .map(({ siid, piid }) => {
        const value = this.properties.get(addressOf(siid, piid));
        return value === undefined
          ? { siid, piid, code: UNKNOWN_ADDRESS }
          : { siid, piid, code: 0, value };
      });
  }

  private write(params: JsonValue): Handled {
    const changes: VacuumChange[] = [];
    const result = z
      .array(ADDRESS)
      .parse(params)
      .map(({ siid, piid, value }) => {
        const property = findProperty(siid, piid);
        if (property === null) {
          return { siid, piid, code: UNKNOWN_ADDRESS };
        }
        if (!property.access.includes('write')) {
          return { siid, piid, code: READ_ONLY_PROPERTY };
        }
        const change = { siid, piid, value: value ?? null };
        this.writes.push(change);
        changes.push(change);
        return { siid, piid, code: 0 };
      });
    return { body: { result }, changes };
  }

  private act(params: JsonValue): Handled {
    const { siid, aiid, in: inputs } = ACTION.parse(params);
    const action = findAction(siid, aiid);
    if (action === null) {
      this.actions.push({ siid, aiid, inputs, outcome: 'unknown' });
      return { body: { result: { code: UNKNOWN_ADDRESS, out: [] } }, changes: [] };
    }
    const safety = actionSafety(action);
    if (safety === 'destructive' || safety === 'never-in-tests') {
      this.actions.push({ siid, aiid, inputs, outcome: 'refused' });
      return refusal(`the fake vacuum never runs ${action.name}`);
    }
    const changes = actionChanges(action, inputs);
    this.actions.push({
      siid,
      aiid,
      inputs,
      outcome: changes.length > 0 ? 'changed' : 'no-effect',
    });
    const out = this.outputs.get(addressOf(siid, aiid)) ?? [];
    return { body: { result: { code: 0, out } }, changes };
  }
}
