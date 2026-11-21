import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { DeviceMetricsRepository } from '../../apps/hub/src/store/repositories/device-metrics.ts';
import type { Seeded } from './store.ts';
import { DAY_MS, HISTORY_DAYS, HOUR_MS, daysAgo, type Anchor } from './clock.ts';
import { DEVICE_SPECS, ROOMS } from './device-specs.ts';
import { capability, type Behaviour, type DeviceSpec } from './devices.ts';
import type { Random } from './random.ts';

const PROVIDER = 'local';
const COUNT_ROW = z.object({ n: z.number() });
const MEMBERS = [
  { name: 'Alex', colour: 'amber', sex: 'female', birth_date: '1990-04-12', height_cm: 168 },
  { name: 'Sam', colour: 'violet', sex: 'male', birth_date: '1987-09-03', height_cm: 181 },
] as const;

export interface HouseholdResult {
  readonly profiles: readonly string[];
  readonly rooms: number;
  readonly devices: number;
  readonly deviceIds: ReadonlyMap<string, string>;
  readonly historyRows: number;
  readonly metricRows: number;
  readonly events: number;
}

interface StateRow {
  readonly deviceId: string;
  readonly capability: string;
  readonly value: JsonValue;
  readonly observedAt: string;
}

function toggles(
  spec: Behaviour,
  rng: Random,
  anchor: Anchor,
): readonly { at: Date; value: boolean }[] {
  if (spec.kind !== 'toggle') return [];
  const rows: { at: Date; value: boolean }[] = [];
  for (let day = HISTORY_DAYS; day >= 0; day -= 1) {
    const count = Math.max(2, spec.perDay + rng.int(-1, 1)) & ~1;
    const hours = Array.from({ length: count }, () => rng.float(spec.start, spec.end)).sort(
      (a, b) => a - b,
    );
    hours.forEach((hour, index) => {
      const at = daysAgo(anchor, day, 0, 0).getTime() + hour * HOUR_MS;
      if (at < anchor.now.getTime()) rows.push({ at: new Date(at), value: index % 2 === 0 });
    });
  }
  return rows;
}

function sample(behaviour: Behaviour, at: Date, rng: Random): number {
  if (behaviour.kind !== 'series') return 0;
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60;
  const daily = Math.sin(((hour - 9) / 24) * 2 * Math.PI);
  const value = behaviour.base + behaviour.swing * daily + rng.float(-1, 1) * behaviour.noise;
  return Math.round(value * 100) / 100;
}

function stateOf(
  spec: DeviceSpec,
  deviceId: string,
  rng: Random,
  anchor: Anchor,
): { readonly rows: StateRow[]; readonly series: Map<string, { at: string; value: number }[]> } {
  const rows: StateRow[] = [];
  const series = new Map<string, { at: string; value: number }[]>();
  const start = daysAgo(anchor, HISTORY_DAYS).toISOString();
  for (const entry of spec.capabilities) {
    const behaviour = entry.behaviour;
    if (behaviour.kind === 'fixed') {
      rows.push({ deviceId, capability: entry.key, value: behaviour.value, observedAt: start });
    } else if (behaviour.kind === 'toggle') {
      rows.push({ deviceId, capability: entry.key, value: false, observedAt: start });
      for (const toggle of toggles(behaviour, rng, anchor))
        rows.push({
          deviceId,
          capability: entry.key,
          value: toggle.value,
          observedAt: toggle.at.toISOString(),
        });
    } else {
      const points: { at: string; value: number }[] = [];
      for (let hour = HISTORY_DAYS * 24; hour >= 0; hour -= 1) {
        const at = new Date(anchor.today.getTime() - hour * HOUR_MS);
        if (at.getTime() >= anchor.now.getTime()) continue;
        points.push({ at: at.toISOString(), value: sample(behaviour, at, rng) });
      }
      series.set(entry.key, points);
      const last = points.at(-1);
      if (last !== undefined)
        rows.push({ deviceId, capability: entry.key, value: last.value, observedAt: last.at });
    }
  }
  return { rows, series };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    out.push(items.slice(index, index + size));
  return out;
}

function storeDevices(store: Seeded, roomIds: ReadonlyMap<string, string>): Map<string, string> {
  const upserted = store.devices.upsert(
    DEVICE_SPECS.map((spec) => ({
      provider: PROVIDER,
      externalId: `seed-${spec.id}`,
      parentId: null,
      kind: spec.kind,
      name: spec.name,
      model: spec.model,
      manufacturer: spec.manufacturer,
      providerRoom: spec.room,
      roomId: roomIds.get(spec.room) ?? null,
      online: spec.id !== 'ba-scale',
      capabilities: spec.capabilities.map((entry) => capability(entry.key, entry.access)),
      details: { synthetic: true, ...(spec.details ?? {}) },
    })),
  );
  return new Map(upserted.map((row) => [row.external_id.replace(/^seed-/u, ''), row.id] as const));
}

function storeSeries(
  metrics: DeviceMetricsRepository,
  deviceId: string,
  series: ReadonlyMap<string, readonly { at: string; value: number }[]>,
): number {
  let rows = 0;
  for (const [key, points] of series) {
    const buckets = points.map((point) => ({
      deviceId,
      capability: key,
      bucketStart: point.at,
      average: point.value,
      minimum: point.value,
      maximum: point.value,
      count: 60,
    }));
    for (const batch of chunks(buckets, 2000)) metrics.saveMinutes(batch);
    rows += buckets.length;
  }
  return rows;
}

function storeStates(
  store: Seeded,
  anchor: Anchor,
  rng: Random,
  deviceIds: ReadonlyMap<string, string>,
): number {
  const metrics = new DeviceMetricsRepository(store.context);
  const states: StateRow[] = [];
  let metricRows = 0;
  for (const spec of DEVICE_SPECS) {
    const deviceId = deviceIds.get(spec.id);
    if (deviceId === undefined) throw new Error(`Device ${spec.id} was not stored.`);
    const { rows, series } = stateOf(spec, deviceId, rng, anchor);
    states.push(...rows);
    metricRows += storeSeries(metrics, deviceId, series);
  }
  const from = daysAgo(anchor, HISTORY_DAYS + 1).toISOString();
  metrics.rollHours(from, new Date(anchor.now.getTime() + DAY_MS).toISOString());
  states.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  for (const batch of chunks(states, 1000)) store.state.write(batch);
  return metricRows;
}

function historyCount(store: Seeded): number {
  const row = store.database.prepare('select count(*) as n from state_history').get();
  return COUNT_ROW.parse(row).n;
}

function storeCameras(store: Seeded, deviceIds: ReadonlyMap<string, string>): void {
  store.cameras.upsert(
    DEVICE_SPECS.filter((spec) => spec.kind === 'camera').map((spec) => ({
      deviceId: deviceIds.get(spec.id) ?? '',
      streamName: `seed-${spec.id}`,
      sourceUrlKind: 'rtsp',
      physicalPtz: false,
      twoWayAudio: false,
    })),
  );
}

export function seedHousehold(store: Seeded, anchor: Anchor, rng: Random): HouseholdResult {
  const profiles = [store.profiles.first().id];
  for (const member of MEMBERS) profiles.push(store.profiles.create({ ...member }).id);
  const roomIds = new Map(
    ROOMS.map((name, index) => [name, store.rooms.create(name, index).id] as const),
  );
  const deviceIds = storeDevices(store, roomIds);
  const metricRows = storeStates(store, anchor, rng, deviceIds);
  storeCameras(store, deviceIds);
  return {
    profiles,
    rooms: roomIds.size,
    devices: deviceIds.size,
    deviceIds,
    historyRows: historyCount(store),
    metricRows,
    events: eventsOf(store, anchor, rng, deviceIds),
  };
}

function eventsOf(
  store: Seeded,
  anchor: Anchor,
  rng: Random,
  deviceIds: ReadonlyMap<string, string>,
): number {
  const rows: Parameters<Seeded['events']['insert']>[0][number][] = [];
  const plan: readonly [string, 'motion' | 'person' | 'doorbell' | 'opened' | 'pet', number][] = [
    ['hw-camera', 'person', 2],
    ['hw-camera', 'motion', 3],
    ['lr-camera', 'motion', 4],
    ['lr-camera', 'pet', 1],
    ['hw-doorbell', 'doorbell', 1],
    ['hw-door', 'opened', 4],
    ['ga-door', 'opened', 1],
  ];
  for (let day = HISTORY_DAYS; day >= 0; day -= 1) {
    for (const [id, kind, perDay] of plan) {
      const deviceId = deviceIds.get(id);
      if (deviceId === undefined) continue;
      const count = rng.int(0, perDay);
      for (let index = 0; index < count; index += 1) {
        const at = new Date(daysAgo(anchor, day).getTime() + rng.float(6, 23.5) * HOUR_MS);
        if (at.getTime() < anchor.now.getTime())
          rows.push({ deviceId, kind, occurredAt: at.toISOString(), details: { synthetic: true } });
      }
    }
  }
  for (const batch of chunks(rows, 500)) store.events.insert(batch);
  return rows.length;
}
