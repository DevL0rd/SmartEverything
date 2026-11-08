import { COMPUTER_ROLE_MODELS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { groupedDevices, ANY } from '../features/device-list/model/device-filter';
import { deviceFixture, stateFixture } from './device-fixture';
import { devicesIn, isPhysicalDevice, listedDevicesIn } from './selectors';
import { rowsOf } from './state';

const HUB = deviceFixture(0, {
  id: '9ecdc9f3-5089-4281-a18f-f03ab7ac1b38',
  provider: 'local',
  external_id: 'computer:hub',
  kind: 'computer',
  model: COMPUTER_ROLE_MODELS.hub,
  name: 'DevL0rd-Laptop',
  capabilities: [],
  details: { os: 'Linux' },
});
const LAPTOP = deviceFixture(1, {
  id: 'fda22089-7faa-4b09-b39c-6281a9ebaeca',
  provider: 'local',
  external_id: 'computer:484e39c215d14bd68cd5f8679d8febbb',
  kind: 'computer',
  model: COMPUTER_ROLE_MODELS.pc,
  name: HUB.name,
});

describe('physical device listings', () => {
  it('keeps the paired laptop with the same name while retaining the hub raw identity', () => {
    const state = stateFixture([HUB, LAPTOP], {});
    expect(listedDevicesIn(state)).toEqual([LAPTOP]);
    expect(rowsOf(state.tables.devices)).toEqual([HUB, LAPTOP]);
    expect(listedDevicesIn(state)).toBe(listedDevicesIn(state));
  });

  it('shows the paired laptop in Devices without demanding telemetry from the built-in hub', () => {
    const state = stateFixture([HUB, LAPTOP], {});
    const sections = groupedDevices(listedDevicesIn(state), [], {
      text: '',
      room: ANY,
      kind: ANY,
      offline: false,
    });
    expect(sections.flatMap((section) => section.devices)).toEqual([LAPTOP]);
  });

  it('retains hidden physical devices in Settings and excludes replaced devices', () => {
    const hidden = deviceFixture(2, { hidden: true });
    const replacement = deviceFixture(3, { details: { replaces: LAPTOP.id } });
    expect(listedDevicesIn(stateFixture([HUB, LAPTOP, hidden, replacement], {}))).toEqual([
      hidden,
      replacement,
    ]);
  });

  it('excludes the assigned hub from automatic room tiles while preserving raw room access', () => {
    const hub = { ...HUB, room_id: 'study' };
    const laptop = { ...LAPTOP, room_id: 'study' };
    const hidden = deviceFixture(2, { room_id: 'study', hidden: true });
    const state = stateFixture([hub, laptop, hidden], {});
    const room = devicesIn(state, { room: 'study' });
    expect(room).toEqual([hub, laptop]);
    expect(room.filter(isPhysicalDevice)).toEqual([laptop]);
    expect(devicesIn(state, { includeHidden: true }).filter(isPhysicalDevice)).toEqual([
      laptop,
      hidden,
    ]);
  });
});
