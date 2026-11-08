import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import {
  applianceButtons,
  applianceOf,
  blasterChoices,
  controlNote,
  missingControlButtons,
  offlineCause,
} from './appliance-model';

function keysOf(keys: readonly string[]): DeviceCapability[] {
  return [
    { key: 'power', label: 'Power', access: 'write', value: { kind: 'boolean' } },
    {
      key: 'remote_key',
      label: 'Remote button',
      access: 'write',
      value: { kind: 'enum', options: [...keys] },
    },
  ];
}

function deviceOf(id: string, change: Partial<Device> = {}): Device {
  return {
    id,
    provider: 'local',
    external_id: `ir_appliance:${id}`,
    parent_id: null,
    kind: 'air_conditioner',
    name: id,
    display_name: null,
    model: 'IR appliance',
    manufacturer: 'Infrared',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: { irApplianceId: `remote-${id}`, blasterId: 'blaster-1', category: 'air conditioner' },
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-25T00:00:00.000Z',
    updated_at: '2026-10-25T00:00:00.000Z',
    label: id,
    ...change,
  };
}

const SENDS: DeviceCapability = {
  key: 'ir_send',
  label: 'Send',
  access: 'write',
  value: { kind: 'action' },
};

describe('IR appliance details', () => {
  it('reads the appliance id, blaster and category of a promoted remote', () => {
    expect(applianceOf(deviceOf('ac'))).toEqual({
      id: 'remote-ac',
      blasterId: 'blaster-1',
      category: 'air conditioner',
    });
  });

  it('treats a device without appliance details as no appliance', () => {
    expect(applianceOf(deviceOf('plug', { details: {} }))).toBeNull();
    expect(applianceOf(deviceOf('cloud', { provider: 'tuya' }))).toBeNull();
  });

  it('fails loudly when the appliance details are broken', () => {
    expect(() => applianceOf(deviceOf('bad', { details: { irApplianceId: 7 } }))).toThrow();
  });
});

describe('IR appliance buttons', () => {
  it('lists the air conditioner buttons with what is learned and keeps extra keys', () => {
    const device = deviceOf('ac', { capabilities: keysOf(['power', 'Temp up', 'Swing']) });
    expect(applianceButtons(device, 'air conditioner')).toEqual([
      { name: 'Power', learned: 'power' },
      { name: 'Temp up', learned: 'Temp up' },
      { name: 'Temp down', learned: null },
      { name: 'Mode', learned: null },
      { name: 'Fan speed', learned: null },
      { name: 'Swing', learned: 'Swing' },
    ]);
  });

  it('suggests the usual buttons of the category for other appliances', () => {
    const fan = deviceOf('fan', { kind: 'fan', capabilities: keysOf(['Power']) });
    expect(applianceButtons(fan, 'fan').map((button) => button.name)).toEqual([
      'Power',
      'Speed up',
      'Speed down',
      'Oscillate',
    ]);
  });

  it('names exactly the buttons the air conditioner still needs before it can be controlled', () => {
    expect(controlNote(missingControlButtons(deviceOf('ac')))).toBe(
      'Learn Power, Temp up, Temp down and Mode to control this air conditioner',
    );
    const some = deviceOf('ac', { capabilities: keysOf(['Power', 'Temp up', 'Temp down']) });
    expect(controlNote(missingControlButtons(some))).toBe(
      'Learn Mode to control this air conditioner',
    );
    const all = deviceOf('ac', {
      capabilities: keysOf(['Power', 'Temp up', 'Temp down', 'Mode']),
    });
    expect(controlNote(missingControlButtons(all))).toBeNull();
  });

  it('asks nothing of appliances that are not air conditioners', () => {
    expect(missingControlButtons(deviceOf('tv', { kind: 'television' }))).toEqual([]);
  });
});

describe('IR appliance blaster', () => {
  it('offers every other device that can send infrared', () => {
    const current = deviceOf('blaster-1', { kind: 'ir_blaster', capabilities: [SENDS] });
    const other = deviceOf('blaster-2', { kind: 'ir_blaster', capabilities: [SENDS] });
    const plug = deviceOf('plug', { kind: 'plug' });
    expect(blasterChoices([current, other, plug], 'blaster-1')).toEqual([other]);
    expect(blasterChoices([current, other, plug], null)).toEqual([current, other]);
  });

  it('says why the appliance is offline', () => {
    const appliance = { id: 'remote-ac', blasterId: 'blaster-1', category: 'air conditioner' };
    const blaster = deviceOf('blaster-1', { kind: 'ir_blaster', label: 'Hall blaster' });
    expect(offlineCause(appliance, blaster)).toBe(
      'Hall blaster is offline, so nothing can be sent to it.',
    );
    expect(offlineCause({ ...appliance, blasterId: null }, null)).toBe(
      'Its IR blaster was removed. Choose another blaster to send through.',
    );
  });
});
