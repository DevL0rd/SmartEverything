import { readFileSync } from 'node:fs';
import {
  CAPABILITY_KEY,
  DEVICE_ROW,
  VACUUM_SCENE,
  type DeviceCapability,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type VacuumClean,
  type VacuumScene,
  type VacuumTrailRun,
} from '@smarteverything/domain';
import { deviceEventFromMiot } from '@smarteverything/xiaomi';
import { z } from 'zod';
import type { CleanMap } from '../../src/vacuum/clean-tracked';
import { VacuumCleanTracker } from '../../src/vacuum/clean-tracker';
import { testLogger } from '../support/logs';

export const ROBOT_ID = '2d000000-0000-4000-8000-0000000000b1';
export const LIGHT_ID = '2d000000-0000-4000-8000-0000000000b2';
export const ROBOT_EXTERNAL = 'did-robot';
export const BASE = Date.parse('2026-10-24T08:00:00.000Z');

export const STATUS = 'raw:2.2';
export const MODE = 'raw:2.4';
export const SCOPE = 'raw:2.5';
export const AREA = 'raw:2.6';
export const SECONDS = 'raw:2.7';
export const JOB = 'raw:2.40';
export const RECORD = 'raw:10.15';
export const BATTERY = 'battery';

const TIMELINE = z.array(
  z.object({
    tMs: z.number(),
    siid: z.number().int(),
    piid: z.number().int().optional(),
    eiid: z.number().int().optional(),
    value: z.unknown().optional(),
  }),
);

export type Entry = z.infer<typeof TIMELINE>[number];

export const TIMELINE_ENTRIES = TIMELINE.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/xiaomi/test/fixtures/vacuum/pv11gl-status-timeline.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

const READ_KEYS = [
  STATUS,
  MODE,
  SCOPE,
  AREA,
  SECONDS,
  JOB,
  RECORD,
  'raw:2.3',
  'raw:2.66',
  'raw:3.2',
];

const TEXT_KEYS: ReadonlySet<string> = new Set([JOB, RECORD, 'raw:2.66']);

function capability(key: string): DeviceCapability {
  const value: DeviceCapability['value'] =
    key === 'power'
      ? { kind: 'boolean' }
      : TEXT_KEYS.has(key)
        ? { kind: 'text', maxLength: 1000 }
        : { kind: 'number', min: 0, max: 1_000_000, step: 1 };
  return { key: CAPABILITY_KEY.parse(key), label: key, access: 'read', value };
}

function row(id: string, model: string, kind: string, keys: readonly string[]): DeviceRow {
  return DEVICE_ROW.parse({
    id,
    provider: 'xiaomi',
    external_id: id === ROBOT_ID ? ROBOT_EXTERNAL : 'did-light',
    parent_id: null,
    kind,
    name: 'Device',
    display_name: null,
    model,
    manufacturer: 'Xiaomi',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: keys.map(capability),
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  });
}

export const ROBOT = row(ROBOT_ID, 'xiaomi.vacuum.pv11gl', 'vacuum', [...READ_KEYS, BATTERY]);
export const LIGHT = row(LIGHT_ID, 'yeelink.light.lamp1', 'light', ['power']);

export function claimable(device: DeviceRow): Parameters<VacuumCleanTracker['claim']>[0] {
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

export function sceneOf(index: number, trail: readonly VacuumTrailRun[] = []): VacuumScene {
  return VACUUM_SCENE.parse({
    index,
    slot: 'current',
    name: null,
    fetchedAt: '2026-10-24T08:00:00.000Z',
    bounds: { minX: 0, minY: 0, maxX: 4, maxY: 3 },
    rooms: [],
    walls: [],
    doors: [],
    carpets: [],
    furniture: [],
    objects: [],
    zones: [],
    dock: null,
    robot: null,
    trail,
  });
}

export class Bench {
  now = BASE;
  readonly values = new Map<string, JsonValue>();
  readonly cleans = new Map<string, VacuumClean>();
  readonly events: DeviceEvent[] = [];
  readonly map: { -readonly [Key in keyof CleanMap]: CleanMap[Key] } = {
    taskId: null,
    index: null,
    rooms: new Map([[3, 'Kitchen']]),
    trail: [],
  };
  tracker: VacuumCleanTracker;
  private next = 0;

  constructor() {
    this.tracker = this.build();
  }

  private build(): VacuumCleanTracker {
    return new VacuumCleanTracker({
      device: (id) => [ROBOT, LIGHT].find((device) => device.id === id),
      value: (deviceId, key) => this.values.get(`${deviceId}|${key}`),
      record: (_provider, event): void => {
        this.events.push(event);
      },
      cleans: {
        save: (_deviceId, clean): void => {
          this.cleans.set(clean.id, clean);
        },
        get: (_deviceId, id) => this.cleans.get(id),
        rename: (_deviceId, from, to): void => {
          const held = this.cleans.get(from);
          if (held === undefined) return;
          this.cleans.delete(from);
          this.cleans.set(to, { ...held, id: to });
        },
        open: () =>
          [...this.cleans.values()]
            .filter((clean) => clean.endedAt === null)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0],
      },
      map: () => this.map,
      now: () => new Date(this.now),
      log: testLogger('vacuum-clean'),
    });
  }

  restart(): void {
    this.tracker = this.build();
  }

  seed(key: string, value: JsonValue): void {
    this.values.set(`${ROBOT_ID}|${key}`, value);
  }

  set(key: string, value: JsonValue, deviceId = ROBOT_ID): void {
    const id = `${deviceId}|${key}`;
    const previous = this.values.get(id);
    if (JSON.stringify(previous) === JSON.stringify(value)) return;
    this.values.set(id, value);
    this.tracker.observe({ deviceId, capability: CAPABILITY_KEY.parse(key), value, previous });
  }

  advance(seconds: number): void {
    this.now += seconds * 1000;
  }

  sweepComplete(): boolean {
    const event = deviceEventFromMiot('sweep-complete', {
      externalId: ROBOT_EXTERNAL,
      occurredAt: new Date(this.now).toISOString(),
      details: {},
    });
    const claimed = this.tracker.claim(claimable(ROBOT), event);
    if (!claimed) this.events.push(event);
    return claimed;
  }

  play(entry: Entry): void {
    this.now = BASE + entry.tMs;
    if (entry.eiid !== undefined) {
      this.sweepComplete();
    } else if (entry.piid !== undefined) {
      this.set(
        `raw:${String(entry.siid)}.${String(entry.piid)}`,
        z.custom<JsonValue>().parse(entry.value),
      );
    }
  }

  playUntil(tMs: number): void {
    while (this.next < TIMELINE_ENTRIES.length && (TIMELINE_ENTRIES[this.next]?.tMs ?? 0) <= tMs) {
      const entry = TIMELINE_ENTRIES[this.next];
      this.next += 1;
      if (entry !== undefined) this.play(entry);
    }
  }

  rows(): VacuumClean[] {
    return [...this.cleans.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  finished(): DeviceEvent[] {
    return this.events.filter((event) => event.kind === 'cycle_finished');
  }
}

export function resting(): Bench {
  const bench = new Bench();
  bench.seed(STATUS, 2);
  bench.seed(BATTERY, 100);
  bench.seed(SCOPE, 3);
  bench.seed(MODE, 3);
  bench.seed(JOB, '{"rooms":[3,4],"clean_mode":3}');
  bench.seed(AREA, 0);
  bench.seed(SECONDS, 0);
  return bench;
}
