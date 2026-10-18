import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import type { Device, DeviceValues } from '../../../store/state';
import { deviceModelOf } from '../../devices';
import type { StatusTone } from '../../../components/tone';
import type { ClimateSource } from './climate-devices';
import { hasSupplies, needsAttention, suppliesOf } from './supplies';

const AT = '2026-10-16T10:00:00Z';

function number(key: DeviceCapability['key'], label: string): DeviceCapability {
  return { key, label, access: 'read', value: { kind: 'number', min: 0, max: 100, step: 1 } };
}

function humidifier(capabilities: DeviceCapability[]): Device {
  return {
    id: 'hum',
    provider: 'local',
    external_id: 'hum',
    parent_id: null,
    kind: 'humidifier',
    name: 'Humidifier',
    display_name: null,
    model: 'generic',
    manufacturer: 'test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities,
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: AT,
    updated_at: AT,
    label: 'Humidifier',
  };
}

function sourceOf(
  capabilities: DeviceCapability[],
  readings: Record<string, DeviceValues[string]['value']>,
): ClimateSource {
  const values: Record<string, DeviceValues[string]> = {};
  for (const [key, value] of Object.entries(readings)) {
    values[key] = { value, observedAt: AT };
  }
  return { model: deviceModelOf(humidifier(capabilities)), values };
}

describe('suppliesOf', () => {
  const filter = [number('filter_life', 'Filter life')];

  it('turns the filter life into a level with a tone that worsens as it runs out', () => {
    const tone = (life: number): StatusTone | undefined =>
      suppliesOf(sourceOf(filter, { filter_life: life }))[0]?.tone;
    expect(tone(80)).toBe('positive');
    expect(tone(19)).toBe('warning');
    expect(tone(10)).toBe('warning');
    expect(tone(9)).toBe('critical');
  });

  it('describes the filter with its life as a share of one', () => {
    const [line] = suppliesOf(sourceOf(filter, { filter_life: 50 }));
    expect(line).toMatchObject({
      kind: 'filter',
      deviceId: 'hum',
      key: 'hum:filter',
      level: 0.5,
    });
  });

  it('reports a water tank as low when the device says it is empty', () => {
    const capabilities: DeviceCapability[] = [
      { key: 'tank_empty', label: 'Tank empty', access: 'read', value: { kind: 'boolean' } },
    ];
    const [line] = suppliesOf(sourceOf(capabilities, { tank_empty: true }));
    expect(line).toMatchObject({ kind: 'water', text: 'Low, refill soon', tone: 'warning' });
  });

  it('reports a water tank level as a percentage and low under twenty', () => {
    const capabilities = [number('water_level', 'Water level')];
    const full = suppliesOf(sourceOf(capabilities, { water_level: 70 }))[0];
    expect(full).toMatchObject({ text: '70 %', tone: 'positive' });
    const low = suppliesOf(sourceOf(capabilities, { water_level: 15 }))[0];
    expect(low).toMatchObject({ text: 'Low, refill soon', tone: 'warning' });
  });

  it('has no supply for a device with nothing to refill', () => {
    const source = sourceOf([number('humidity', 'Humidity')], { humidity: 50 });
    expect(suppliesOf(source)).toEqual([]);
    expect(hasSupplies(source)).toBe(false);
  });
});

describe('needsAttention', () => {
  it('needs attention for any line that is not positive', () => {
    const [good] = suppliesOf(
      sourceOf([number('filter_life', 'Filter life')], { filter_life: 90 }),
    );
    const [bad] = suppliesOf(sourceOf([number('filter_life', 'Filter life')], { filter_life: 5 }));
    if (good === undefined || bad === undefined) {
      throw new Error('no lines');
    }
    expect(needsAttention(good)).toBe(false);
    expect(needsAttention(bad)).toBe(true);
  });
});
