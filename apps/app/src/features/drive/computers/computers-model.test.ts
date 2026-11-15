import { describe, expect, it } from 'vitest';
import { computersSubtitleOf, seenTextOf } from './computers-model';
import { NOW, WORKSTATION, computer } from './placement-fixture';

describe('computers on the Drive computers page', () => {
  const office = computer('b0000000-0000-4000-8000-000000000003', 'Office', { online: false });
  const workstation = computer(WORKSTATION, 'Workstation', { online: true });

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
});
