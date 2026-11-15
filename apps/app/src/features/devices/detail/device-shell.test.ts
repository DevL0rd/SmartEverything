import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import type { DeviceSection } from './sections';
import { sectionsShellOf } from './device-shell';

function section(key: string, title: string): DeviceSection {
  return { key, title, icon: 'info', render: () => null };
}

const SECTIONS = [
  section('overview', 'Overview'),
  section('controls', 'All controls'),
  section('history', 'History'),
  section('activity', 'Activity'),
];

describe('device page sections', () => {
  it('lists every section of the device as one rail group with the active one marked', () => {
    const shell = sectionsShellOf(deviceFixture(0), SECTIONS, 'history');
    expect(shell.active).toBe('history');
    expect(shell.groups).toHaveLength(1);
    expect(shell.groups[0]?.entries.map((entry) => entry.id)).toEqual([
      'overview',
      'controls',
      'history',
      'activity',
    ]);
    expect(shell.groups[0]?.entries[1]).toMatchObject({ label: 'All controls', short: 'Controls' });
  });

  it('links the overview to the device page and every other section to its own page', () => {
    const device = deviceFixture(0);
    const shell = sectionsShellOf(device, SECTIONS, 'overview');
    expect(shell.hrefOf('overview')).toEqual({
      pathname: '/device/[deviceId]',
      params: { deviceId: device.id },
    });
    expect(shell.hrefOf('activity')).toEqual({
      pathname: '/device/[deviceId]/[section]',
      params: { deviceId: device.id, section: 'activity' },
    });
  });

  it('replaces the open section instead of stacking another one', () => {
    expect(sectionsShellOf(deviceFixture(0), SECTIONS, 'overview').navigation).toBe('replace');
  });
});
