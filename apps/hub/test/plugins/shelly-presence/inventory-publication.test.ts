import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { ShellyDevice } from '@smarteverything/shelly';
import { afterEach, describe, expect, it } from 'vitest';
import { shellyDevices } from '../../../src/plugins/builtin/shelly-presence/projector';
import {
  rememberedShelly,
  unpublishedIds,
} from '../../../src/plugins/builtin/shelly-presence/session-publication';
import { shellySnapshot } from '../../../src/plugins/builtin/shelly-presence/snapshot';
import { DEVICE_ID, enrollmentAt, memoryRecords } from './fake-shelly';
import { closeHarnesses, harness } from './harness';

afterEach(closeHarnesses);

const PARENT = `shelly-presence:${DEVICE_ID}`;

function sensor(
  zones: readonly number[],
  main: number | undefined,
  names: Readonly<Record<number, string>> = {},
): ShellyDevice {
  const config: Record<string, JsonValue> = {
    sys: { device: { name: 'Hall radar' } },
    presence:
      main === undefined
        ? { enable: true }
        : { enable: true, main_zone: `presencezone:${String(main)}` },
  };
  const status: Record<string, JsonValue> = { sys: { cfg_rev: 5 }, presence: {} };
  for (const id of zones) {
    config[`presencezone:${String(id)}`] = {
      id,
      enable: true,
      area: [[0, 0, 4, 4]],
      ...(names[id] === undefined ? {} : { name: names[id] }),
    };
    status[`presencezone:${String(id)}`] = { id, value: false, num_objects: 0 };
  }
  return shellySnapshot(enrollmentAt('http://127.0.0.1:1'), {
    config,
    status,
    methods: [],
    revision: 5,
    statusSequence: 1,
  });
}

function forgotten(before: ShellyDevice, after: ShellyDevice): string[] {
  return unpublishedIds(before, shellyDevices(after));
}

describe('Shelly inventory publication', () => {
  it('never forgets the sensor when its main zone disappears from a fresh read', () => {
    expect(forgotten(sensor([200], 200), sensor([], 200))).toEqual([]);
    expect(forgotten(sensor([200], 200), sensor([200], undefined))).toEqual([]);
  });

  it('never forgets the sensor when the main zone moves, and forgets the zone that became main', () => {
    const before = sensor([200, 201], 200);
    const after = sensor([200, 201], 201);
    const child = before.zones.find((zone) => zone.key === 'presencezone:201')?.externalId;
    expect(forgotten(before, after)).toEqual([child?.slice('shelly-presence:'.length)]);
    expect(shellyDevices(after).map((device) => device.externalId)).toContain(PARENT);
  });

  it('forgets only a child zone that is gone and keeps renamed zones', () => {
    const before = sensor([200, 201, 202], 200);
    expect(forgotten(before, sensor([200, 201, 202], 200, { 201: 'Desk' }))).toEqual([]);
    const gone = before.zones.find((zone) => zone.key === 'presencezone:202')?.externalId;
    expect(forgotten(before, sensor([200, 201], 200))).toEqual([
      gone?.slice('shelly-presence:'.length),
    ]);
  });

  it('forgets nothing on a first start with no or an unreadable remembered snapshot', () => {
    const after = sensor([200, 201], 200);
    const empty = rememberedShelly(memoryRecords(), enrollmentAt('http://127.0.0.1:1'));
    expect(forgotten(empty, after)).toEqual([]);
    const records = memoryRecords();
    records.put(DEVICE_ID, { id: DEVICE_ID, zones: 'old format' });
    expect(forgotten(rememberedShelly(records, enrollmentAt('http://127.0.0.1:1')), after)).toEqual(
      [],
    );
  });

  it('forgets nothing when the remembered sensor was offline or connecting', () => {
    const remembered = sensor([200], 200);
    for (const state of ['connecting', 'offline'] as const)
      expect(
        forgotten({ ...remembered, connection: { state, reason: null } }, sensor([200], 200)),
      ).toEqual([]);
  });

  it('reads dynamic zones from Shelly.GetComponents and keeps the sensor on startup', async () => {
    const records = memoryRecords();
    records.put(DEVICE_ID, JSON_VALUE.parse(JSON.parse(JSON.stringify(sensor([200], 200)))));
    const ready = await harness({ snapshots: records });
    expect(ready.session.current().zones.map((zone) => [zone.key, zone.main])).toEqual([
      ['presencezone:200', true],
    ]);
    expect(ready.forgotten.flat()).toEqual([]);
    const pages = ready.shelly.calls.filter((call) => call.method === 'Shelly.GetComponents');
    expect(pages.slice(0, 2).map((call) => call.params)).toEqual([
      { offset: 0, include: ['config', 'status'] },
      { offset: 2, include: ['config', 'status'] },
    ]);
  });
});
