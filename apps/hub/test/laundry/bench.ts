import { readFileSync } from 'node:fs';
import {
  CAPABILITY_KEY,
  DEVICE_CAPABILITY,
  DEVICE_ROW,
  UNLOAD_PENDING_CAPABILITY,
  UNLOAD_PENDING_KEY,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type Provider,
  type StateUpdate,
} from '@smarteverything/domain';
import { z } from 'zod';
import { deviceEventFromMiot } from '@smarteverything/xiaomi';
import { CycleTracker } from '../../src/laundry/cycle-tracker';
import { testLogger } from '../support/logs';

export const WASHER_ID = '1d000000-0000-4000-8000-0000000000a1';
export const LIGHT_ID = '1d000000-0000-4000-8000-0000000000a2';
export const START = Date.parse('2026-10-17T10:00:00.000Z');
const MINUTE = 60_000;

export const STATUS = 'raw:2.2';
export const PROGRAM = 'raw:2.3';
export const FAULT = 'raw:2.4';
export const REMAINING = 'raw:2.10';
export const RUN_PHASE = 'raw:2.11';
export const DOOR = 'raw:2.9';
export const UNLOAD = UNLOAD_PENDING_KEY;
export const FILTER = 'raw:2.42';
export const DETERGENT = 'raw:8.1';
export const SOFTENER = 'raw:9.1';

const CAPABILITIES = z
  .array(DEVICE_CAPABILITY)
  .parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/domain/test/fixtures/mibx5-f29gl-capabilities.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );

function row(id: string, model: string, kind: string, capabilities: unknown): DeviceRow {
  return DEVICE_ROW.parse({
    id,
    provider: 'xiaomi',
    external_id: `did-${id.slice(-2)}`,
    parent_id: null,
    kind,
    name: 'Device',
    display_name: null,
    model,
    manufacturer: 'Xiaomi',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities,
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  });
}

export const WASHER = row(WASHER_ID, 'mibx5.washer.f29gl', 'appliance', [
  ...CAPABILITIES,
  UNLOAD_PENDING_CAPABILITY,
]);
export const LIGHT = row(LIGHT_ID, 'yeelink.light.lamp1', 'light', [
  { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
]);

interface Stored {
  readonly provider: Provider;
  readonly occurrence: string | undefined;
  event: DeviceEvent;
}

export class Bench {
  now = START;
  readonly values = new Map<string, JsonValue>();
  readonly stored: Stored[];
  readonly pushed: StateUpdate[] = [];
  devices: readonly DeviceRow[] = [WASHER, LIGHT];
  tracker: CycleTracker;

  constructor(stored: Stored[] = []) {
    this.stored = stored;
    this.tracker = this.build();
  }

  private build(): CycleTracker {
    return new CycleTracker({
      device: (id): DeviceRow | undefined => this.devices.find((candidate) => candidate.id === id),
      value: (deviceId, key): JsonValue | undefined => this.values.get(`${deviceId}|${key}`),
      push: (_provider, update): void => {
        this.pushed.push(update);
        this.values.set(`${WASHER_ID}|${update.capability}`, update.value);
      },
      record: (provider, event): void => {
        this.persist(provider, event);
      },
      history: (deviceId) =>
        [...this.stored]
          .reverse()
          .filter((entry) => entry.event.externalId === externalIdOf(deviceId))
          .map((entry) => ({
            kind: entry.event.kind,
            occurredAt: entry.event.occurredAt,
            details: entry.event.details,
          })),
      now: () => new Date(this.now),
      log: testLogger('laundry'),
    });
  }

  restart(): void {
    this.tracker = this.build();
  }

  private persist(provider: Provider, event: DeviceEvent): void {
    if (this.tracker.claim(deviceOf(WASHER), event)) {
      return;
    }
    const existing = this.stored.find(
      (entry) => event.occurrence !== undefined && entry.occurrence === event.occurrence,
    );
    if (existing !== undefined) {
      existing.event = {
        ...existing.event,
        details: { ...event.details, ...existing.event.details },
      };
      return;
    }
    this.stored.push({ provider, occurrence: event.occurrence, event });
  }

  seed(deviceId: string, key: string, value: JsonValue): void {
    this.values.set(`${deviceId}|${key}`, value);
  }

  set(key: string, value: JsonValue, deviceId = WASHER_ID): void {
    const id = `${deviceId}|${key}`;
    const previous = this.values.get(id);
    this.values.set(id, value);
    this.tracker.observe({ deviceId, capability: CAPABILITY_KEY.parse(key), value, previous });
  }

  advance(minutes: number): void {
    this.now += minutes * MINUTE;
  }

  kinds(): string[] {
    return this.stored.map((entry) => entry.event.kind);
  }

  last(): DeviceEvent {
    const entry = this.stored.at(-1);
    if (entry === undefined) {
      throw new Error('No event was recorded.');
    }
    return entry.event;
  }
}

export function reported(
  name: string,
  at: number,
  details: Record<string, JsonValue>,
): DeviceEvent {
  const event = deviceEventFromMiot(name, {
    externalId: WASHER.external_id,
    occurredAt: new Date(at).toISOString(),
    details,
  });
  if (event === null) {
    throw new Error(`The ${name} event is not mapped.`);
  }
  return event;
}

function externalIdOf(deviceId: string): string {
  return [WASHER, LIGHT].find((candidate) => candidate.id === deviceId)?.external_id ?? '';
}

export function resting(): Bench {
  const bench = new Bench();
  bench.seed(WASHER_ID, STATUS, 'Idle');
  bench.seed(WASHER_ID, PROGRAM, 'ECO4060');
  bench.seed(WASHER_ID, REMAINING, 0);
  bench.seed(WASHER_ID, RUN_PHASE, 'Not Run');
  bench.seed(WASHER_ID, FAULT, 'No Faults');
  bench.seed(WASHER_ID, DETERGENT, 'Normal');
  bench.seed(WASHER_ID, SOFTENER, 'Normal');
  bench.seed(WASHER_ID, FILTER, false);
  return bench;
}

export function runCycle(bench: Bench): void {
  bench.set(REMAINING, 190);
  bench.set(STATUS, 'Busy');
  bench.advance(5);
  bench.set(RUN_PHASE, 'Weighing');
  bench.advance(5);
  bench.set(RUN_PHASE, 'Washing');
  bench.advance(60);
  bench.set(RUN_PHASE, 'Rinsing');
  bench.advance(30);
  bench.set(RUN_PHASE, 'Spinning');
}

export function deviceOf(
  device: DeviceRow,
): { readonly id: string; readonly provider: Provider; readonly externalId: string } & Parameters<
  CycleTracker['claim']
>[0] {
  return {
    id: device.id,
    provider: device.provider,
    externalId: device.external_id,
    parentId: null,
    kind: device.kind,
    online: true,
    roomId: null,
    capabilities: device.capabilities,
    details: {},
  };
}
