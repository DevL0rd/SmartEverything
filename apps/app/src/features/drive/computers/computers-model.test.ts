import { describe, expect, it } from 'vitest';
import { COMPUTER_ROLE_MODELS } from '@smarteverything/domain';
import {
  computersOf,
  computersSubtitleOf,
  homeDiskOf,
  homeUsageOf,
  osLineOf,
  seenTextOf,
} from './computers-model';
import { GB, LAPTOP, NOW, WORKSTATION, computer, disk } from './placement-fixture';

describe('computers on the Drive computers page', () => {
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

  it('counts the computers and names a single offline one', () => {
    expect(computersSubtitleOf([])).toBeUndefined();
    expect(computersSubtitleOf([workstation, office])).toBe('2 computers · Office offline');
    expect(computersSubtitleOf([workstation])).toBe('1 computer · all online');
  });

  it('says Now while online and the last moment it was seen otherwise', () => {
    expect(seenTextOf(true, null, NOW)).toBe('Now');
    expect(seenTextOf(false, null, NOW)).toBeNull();
    expect(seenTextOf(false, '2026-11-07T08:30:00.000Z', NOW)).toMatch(/^today /);
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
