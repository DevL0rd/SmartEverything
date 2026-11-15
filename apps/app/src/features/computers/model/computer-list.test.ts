import { describe, expect, it } from 'vitest';
import { COMPUTER_ROLE_MODELS, type DiskSnapshot } from '@smarteverything/domain';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';
import { computersOf, homeDiskOf, homeUsageOf, osLineOf } from './computer-list';

const WORKSTATION = 'b0000000-0000-4000-8000-000000000001';
const LAPTOP = 'b0000000-0000-4000-8000-000000000002';
const GB = 1e9;

function computer(id: string, label: string, patch: Partial<Device> = {}): Device {
  return deviceFixture(0, {
    id,
    kind: 'computer',
    name: label,
    model: COMPUTER_ROLE_MODELS.pc,
    details: { os: 'Linux' },
    ...patch,
  });
}

function disk(mount: string, usedBytes: number, totalBytes: number): DiskSnapshot {
  return {
    mount,
    device: '/dev/data',
    label: null,
    filesystem: 'ext4',
    usedBytes,
    totalBytes,
    readRate: 0,
    writeRate: 0,
    temperature: null,
  };
}

describe('the list of computers', () => {
  const hub = computer('b0000000-0000-4000-8000-000000000009', 'NAS', {
    model: COMPUTER_ROLE_MODELS.hub,
  });
  const office = computer('b0000000-0000-4000-8000-000000000003', 'Office', { online: false });
  const laptop = computer(LAPTOP, 'Laptop', { online: true });
  const workstation = computer(WORKSTATION, 'Workstation', { online: true });

  it('lists computers without the hub, online first and then by name', () => {
    expect(computersOf([office, hub, workstation, laptop]).map((device) => device.label)).toEqual([
      'Laptop',
      'Workstation',
      'Office',
    ]);
  });

  it('puts this computer first', () => {
    const order = computersOf([office, workstation, laptop], WORKSTATION);
    expect(order.map((device) => device.label)).toEqual(['Workstation', 'Laptop', 'Office']);
  });

  it('says the system, or Computer when the computer did not report it', () => {
    expect(osLineOf(workstation)).toBe('Linux');
    expect(osLineOf(computer(LAPTOP, 'Bare', { details: {} }))).toBe('Computer');
  });

  it('measures the disk that holds the home folder, the deepest mount first', () => {
    const disks = [disk('/', 40 * GB, 100 * GB), disk('/home', 95 * GB, 100 * GB)];
    expect(homeDiskOf(disks, '/home/me')?.mount).toBe('/home');
    expect(homeDiskOf(disks, '/homework')?.mount).toBe('/');
    expect(homeDiskOf([disk('C:\\', 1, 2)], 'c:\\Users\\Me')?.mount).toBe('C:\\');
    expect(homeUsageOf(disks, '/home/me')).toEqual({
      mount: '/home',
      line: '95 GB of 100 GB',
      share: 0.95,
      tone: 'critical',
    });
    expect(homeUsageOf([], '/home/me')).toBeNull();
  });
});
