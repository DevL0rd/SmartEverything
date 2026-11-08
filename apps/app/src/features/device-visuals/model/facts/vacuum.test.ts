import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_KEY,
  MODEL_OVERRIDES,
  presentDevice,
  type CapabilityRole,
  type DeviceCapability,
} from '@smarteverything/domain';
import { deviceFixture } from '../../../../store/device-fixture';
import type { VisualState } from '../../types';
import { visualStateOf } from '../visual-state';

const MODEL = 'xiaomi.vacuum.pv11gl';

const NOW = '2026-10-24T08:00:00.000Z';

function capabilities(): readonly DeviceCapability[] {
  return Object.entries(MODEL_OVERRIDES[MODEL]?.capabilities ?? {}).map(([key, entry]) => ({
    key: CAPABILITY_KEY.parse(key),
    label: entry.label,
    access: 'read',
    value: { kind: 'text', maxLength: 200 },
  }));
}

function visual(
  online: boolean,
  values: Readonly<Partial<Record<CapabilityRole, string | number | boolean>>>,
): VisualState {
  const device = {
    ...deviceFixture(0, { kind: 'vacuum', model: MODEL, capabilities: [...capabilities()] }),
    online,
  };
  const presentation = presentDevice(device);
  const observed = Object.fromEntries(
    Object.entries(values).flatMap(([role, value]) => {
      const key = presentation.capabilities.find((capability) => capability.role === role)?.key;
      return key === undefined ? [] : [[key, { value, observedAt: NOW }]];
    }),
  );
  return visualStateOf(device, observed);
}

describe('what the vacuum visual state carries', () => {
  it('carries the drawn look built from the robot values', () => {
    const state = visual(true, {
      vacuum_status: 14,
      vacuum_station_mode: '{"mode":3,"progress":50}',
      vacuum_water_tank: 'Not Empty',
      vacuum_lidar_status: 'Bottom',
    });
    expect(state.vacuum).toMatchObject({
      phase: 'station_busy',
      station: 'wash_mop',
      stationProgress: 0.5,
      cleanTank: 1,
      lidarUp: false,
      scene: 'both',
    });
    expect(state.power).toBe('on');
  });

  it('shows a cleaning robot with its LiDAR up in the robot scene', () => {
    const state = visual(true, { vacuum_status: 4, vacuum_lidar_status: 'Top' });
    expect(state.vacuum).toMatchObject({ phase: 'cleaning', lidarUp: true, scene: 'robot' });
  });

  it('marks a sleeping robot as off', () => {
    const state = visual(true, { vacuum_status: 1, vacuum_asleep: true });
    expect(state.vacuum?.asleep).toBe(true);
    expect(state.power).toBe('off');
  });

  it('draws an unreachable robot alone', () => {
    const state = visual(false, { vacuum_status: 4 });
    expect(state.vacuum).toMatchObject({ online: false, scene: 'robot' });
  });
});
