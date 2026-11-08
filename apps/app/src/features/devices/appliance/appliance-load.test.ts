import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { deviceModelOf } from '../model/device-model';

const KEYS: DeviceCapability = {
  key: 'remote_key',
  label: 'Remote button',
  access: 'write',
  value: { kind: 'enum', options: ['Power'] },
};

function applianceDevice(details: Device['details']): Device {
  return {
    id: 'air-conditioner',
    provider: 'local',
    external_id: 'ir_appliance:remote-1',
    parent_id: null,
    kind: 'air_conditioner',
    name: 'Air Conditioner',
    display_name: null,
    model: 'IR appliance',
    manufacturer: 'Infrared',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [KEYS],
    details,
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-25T00:00:00.000Z',
    updated_at: '2026-10-25T00:00:00.000Z',
    label: 'Air Conditioner',
  };
}

describe('IR appliance page modules', () => {
  it('load together and give an appliance its Buttons section', async () => {
    const { sectionsOf } = await import('../detail/sections');
    await import('../device-settings/remotes-screen');
    await import('../device-settings/remove-section');
    await import('./appliance-banner');
    await import('./add-appliance-screen');
    const appliance = applianceDevice({
      irApplianceId: 'remote-1',
      blasterId: 'blaster-1',
      category: 'air conditioner',
    });
    expect(sectionsOf(deviceModelOf(appliance)).map((section) => section.key)).toContain('buttons');
    expect(
      sectionsOf(deviceModelOf(applianceDevice({}))).map((section) => section.key),
    ).not.toContain('buttons');
  });
});
