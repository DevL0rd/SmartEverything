import type { DeviceCapability, DeviceRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceUpsert } from '../../src/database/port';
import { prepareTargetCommands, skippedMembersNote } from '../../src/device-groups/commands';
import { deviceGroupSummaries } from '../../src/extensions/mcp/tools/device-groups';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let counter = 0;

const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};
const BRIGHTNESS: DeviceCapability = {
  key: 'brightness',
  label: 'Brightness',
  access: 'read_write',
  value: { kind: 'number', min: 1, max: 100, step: 1 },
};
const OBSERVED_AT = '2026-10-08T10:00:00.000Z';

beforeEach(async () => {
  captureLogs();
  counter = 0;
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function light(overrides: Partial<DeviceUpsert> = {}): DeviceRow {
  counter += 1;
  const [row] = opened.store.devices.upsert([
    {
      provider: 'tuya',
      externalId: `light-${String(counter)}`,
      parentId: null,
      kind: 'light',
      name: `Light ${String(counter)}`,
      model: 'bulb',
      manufacturer: 'Tuya',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [POWER, BRIGHTNESS],
      details: {},
      ...overrides,
    },
  ]);
  if (row === undefined) throw new Error('The light was not stored.');
  return row;
}

function setPower(device: DeviceRow, on: boolean, level = 50): void {
  opened.store.state.write([
    { deviceId: device.id, capability: 'power', value: on, observedAt: OBSERVED_AT },
    { deviceId: device.id, capability: 'brightness', value: level, observedAt: OBSERVED_AT },
  ]);
}

function dim(
  target: Parameters<typeof prepareTargetCommands>[1]['target'],
  scope?: 'all' | 'on',
): ReturnType<typeof prepareTargetCommands> {
  return prepareTargetCommands(
    opened.store,
    {
      target,
      capability: 'brightness',
      value: 30,
      ...(scope === undefined ? {} : { scope }),
    },
    null,
  );
}

describe('target command scope', () => {
  it('plans only the lit members of a group when the scope is on', () => {
    const lit = light();
    const dark = light();
    const alsoLit = light();
    setPower(lit, true);
    setPower(dark, false);
    setPower(alsoLit, true);
    const group = opened.store.deviceGroups.create({
      name: 'Downstairs',
      device_ids: [lit.id, dark.id, alsoLit.id],
    });
    const plan = dim({ kind: 'group', groupId: group.id }, 'on');
    expect(plan.commands.map((command) => command.device_id)).toEqual([lit.id, alsoLit.id]);
    expect(plan.skipped).toEqual([]);
  });

  it('plans every member when the scope is omitted or all', () => {
    const lit = light();
    const dark = light();
    setPower(lit, true);
    setPower(dark, false);
    const group = opened.store.deviceGroups.create({
      name: 'Pair',
      device_ids: [lit.id, dark.id],
    });
    const target = { kind: 'group', groupId: group.id } as const;
    expect(dim(target).commands).toHaveLength(2);
    expect(dim(target, 'all').commands).toHaveLength(2);
  });

  it('reports a lit member that is offline as skipped but not an unlit one', () => {
    const away = light({ online: false });
    const dark = light();
    setPower(away, true);
    setPower(dark, false);
    const plan = dim({ kind: 'devices', deviceIds: [away.id, dark.id] }, 'on');
    expect(plan.commands).toEqual([]);
    expect(plan.skipped).toEqual([{ deviceId: away.id, reason: 'offline' }]);
  });

  it('treats members without a reading or a power control as not lit', () => {
    const unread = light();
    const plain = light({ capabilities: [BRIGHTNESS] });
    setPower(plain, true);
    const plan = dim({ kind: 'devices', deviceIds: [unread.id, plain.id] }, 'on');
    expect(plan).toEqual({ commands: [], skipped: [] });
  });

  it('still names group members that no longer exist when the scope is on', () => {
    const lit = light();
    setPower(lit, true);
    const gone = light();
    const group = opened.store.deviceGroups.create({
      name: 'Shrinking',
      device_ids: [lit.id, gone.id],
    });
    opened.store.devices.remove([gone.id]);
    const plan = dim({ kind: 'group', groupId: group.id }, 'on');
    expect(plan.commands.map((command) => command.device_id)).toEqual([lit.id]);
    expect(plan.skipped).toEqual([{ deviceId: gone.id, reason: 'removed' }]);
  });

  it('plans a room target by its lit lights only', () => {
    const room = opened.store.rooms.create('Hall', 0);
    const lit = light({ roomId: room.id });
    const dark = light({ roomId: room.id });
    setPower(lit, true);
    setPower(dark, false);
    const plan = dim({ kind: 'room', roomId: room.id }, 'on');
    expect(plan.commands.map((command) => command.device_id)).toEqual([lit.id]);
  });
});

describe('device group summaries', () => {
  it('summarises each named group with its live state', () => {
    const first = light();
    const second = light();
    setPower(first, true, 40);
    setPower(second, true, 80);
    const group = opened.store.deviceGroups.create({
      name: 'Pair',
      device_ids: [second.id, first.id],
    });
    const [summary] = deviceGroupSummaries(opened.store, null);
    expect(summary).toMatchObject({
      key: `group:${group.id}`,
      name: 'Pair',
      kind: 'group',
      lost: 0,
      target: { kind: 'group', groupId: group.id },
      state: { members: 2, on: 2, power: 'on', level: { min: 40, max: 80, mean: 60 } },
    });
    expect(summary?.members.map((member) => member.id)).toEqual([second.id, first.id]);
  });

  it('offers a room-lights target only for rooms with several visible lights', () => {
    const study = opened.store.rooms.create('Study', 0);
    const hall = opened.store.rooms.create('Hall', 1);
    light({ roomId: study.id });
    const first = light({ roomId: hall.id });
    light({ roomId: hall.id });
    light({ roomId: hall.id, kind: 'plug', model: 'plug', capabilities: [POWER] });
    setPower(first, true);
    const summaries = deviceGroupSummaries(opened.store, null);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      key: `room-lights:${hall.id}`,
      name: 'Hall lights',
      kind: 'room-lights',
      target: { kind: 'room', roomId: hall.id, families: ['light'] },
      state: { members: 2, on: 1, power: 'mixed' },
    });
  });

  it('lists named groups before room lights', () => {
    const hall = opened.store.rooms.create('Hall', 0);
    const first = light({ roomId: hall.id });
    light({ roomId: hall.id });
    opened.store.deviceGroups.create({ name: 'Solo', device_ids: [first.id] });
    expect(deviceGroupSummaries(opened.store, null).map((summary) => summary.name)).toEqual([
      'Solo',
      'Hall lights',
    ]);
  });

  it('is empty for a home without groups or rooms', () => {
    expect(deviceGroupSummaries(opened.store, null)).toEqual([]);
  });
});

describe('the note about skipped members', () => {
  it('is empty when nobody was skipped', () => {
    expect(skippedMembersNote(opened.store, [])).toBeNull();
  });

  it('names each member and why, with the detail when there is one', () => {
    const away = light({ online: false, name: 'Hall lamp' });
    const shelf = light({ name: 'Shelf' });
    const note = skippedMembersNote(opened.store, [
      { deviceId: away.id, reason: 'offline' },
      { deviceId: shelf.id, reason: 'unsupported', detail: 'Value 500 is outside 1 to 100' },
    ]);
    expect(note).toBe('Skipped members: Hall lamp: Offline; Shelf: Value 500 is outside 1 to 100');
  });

  it('falls back to the id for a device that no longer exists', () => {
    const gone = light();
    opened.store.devices.remove([gone.id]);
    expect(skippedMembersNote(opened.store, [{ deviceId: gone.id, reason: 'removed' }])).toBe(
      `Skipped members: ${gone.id}: No longer exists`,
    );
  });
});
