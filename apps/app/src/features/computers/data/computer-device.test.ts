import type { JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';
import { computerGlyph, factsOf, offersAction } from './computer-device';

function computer(model: string, details: Record<string, JsonValue>): Device {
  return deviceFixture(0, {
    kind: 'computer',
    model,
    details,
    capabilities: [
      { key: 'lock_screen', label: 'Lock', access: 'write', value: { kind: 'action' } },
    ],
  });
}

describe('computer device facts', () => {
  it('reads the system, processor and portability the agent reported', () => {
    const device = computer('smarteverything.computer', {
      os: 'Linux',
      portable: true,
      processor: 'Intel Core i9',
      threads: 32,
    });
    expect(factsOf(device)).toEqual({
      os: 'Linux',
      portable: true,
      processor: 'Intel Core i9',
      threads: 32,
    });
  });

  it('treats missing or malformed details as unknown, not as a laptop', () => {
    expect(factsOf(computer('smarteverything.computer', {}))).toEqual({
      os: null,
      portable: false,
      processor: null,
      threads: null,
    });
    expect(factsOf(computer('smarteverything.computer', { portable: 'yes' })).portable).toBe(false);
  });

  it('uses a monitor for a desktop, a laptop for a portable and a server for the hub', () => {
    expect(computerGlyph(computer('smarteverything.computer', {}))).toBe('monitor');
    expect(computerGlyph(computer('smarteverything.computer', { portable: true }))).toBe('laptop');
    expect(computerGlyph(computer('smarteverything.computer.hub', { portable: true }))).toBe(
      'server',
    );
  });

  it('offers an action only when the device lists it', () => {
    const device = computer('smarteverything.computer', {});
    expect(offersAction(device, 'lock_screen')).toBe(true);
    expect(offersAction(device, 'shut_down')).toBe(false);
  });
});
