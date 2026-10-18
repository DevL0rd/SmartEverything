import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import { deviceOf, type Device } from '../../../store/state';
import { childNoun, hubLine, hubViewOf } from './hub-model';

const HUB = '00000000-0000-4000-8000-0000000000a0';

function child(index: number, online: boolean, model = 'lumi.sensor_switch.v2'): Device {
  return deviceOf(
    deviceFixture(index, {
      id: `00000000-0000-4000-8000-0000000000b${String(index)}`,
      parent_id: HUB,
      model,
      online,
      name: `Button ${String(index)}`,
    }),
  );
}

describe('gateway children', () => {
  it('counts only devices behind this hub and says how many are online', () => {
    const stranger = deviceOf(deviceFixture(9, { parent_id: null }));
    const view = hubViewOf([child(1, true), child(2, false), stranger], HUB);
    expect(view.children.map((entry) => entry.name)).toEqual(['Button 1', 'Button 2']);
    expect(view.online).toBe(1);
    expect(hubLine(view, true)).toBe('Hears 2 buttons · 1 offline');
  });

  it('says all online when nothing is offline', () => {
    const view = hubViewOf([child(1, true), child(2, true)], HUB);
    expect(hubLine(view, true)).toBe('Hears 2 buttons · all online');
  });

  it('names other children devices', () => {
    const view = hubViewOf([child(1, true, 'lumi.sensor_ht.v1')], HUB);
    expect(childNoun(view)).toBe('device');
  });

  it('explains an offline hub and an empty one', () => {
    expect(hubLine(hubViewOf([], HUB), true)).toBe('No devices connected yet');
    expect(hubLine(hubViewOf([child(1, true)], HUB), false)).toBe(
      'Offline. Its buttons can’t be heard.',
    );
  });
});
