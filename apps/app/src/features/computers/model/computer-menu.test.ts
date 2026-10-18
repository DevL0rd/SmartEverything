import { describe, expect, it } from 'vitest';
import { menuEntries, type MenuInput } from './computer-menu';

const ALL = new Set(['restart', 'shut_down', 'sign_out', 'hibernate', 'wake']);

const INPUT: MenuInput = {
  name: 'Workstation',
  offline: false,
  offers: (capability) => ALL.has(capability),
  owner: true,
  canRevoke: true,
  hub: false,
};

const keys = (input: MenuInput): readonly string[] => menuEntries(input).map((entry) => entry.key);

describe('menuEntries', () => {
  it('offers the confirmed power actions, pairing and revoking to the owner', () => {
    expect(keys(INPUT)).toEqual([
      'restart',
      'shut_down',
      'sign_out',
      'hibernate',
      'pair',
      'revoke',
    ]);
  });

  it('asks before every power action and never before pairing', () => {
    const entries = menuEntries(INPUT);
    for (const entry of entries.filter((item) =>
      ['restart', 'shut_down', 'sign_out'].includes(item.key),
    )) {
      expect(entry.confirm?.body).toContain('Unsaved work in open apps may be lost.');
      expect(entry.confirm?.destructive).toBe(true);
    }
    expect(entries.find((entry) => entry.key === 'hibernate')?.confirm?.destructive).toBe(false);
    expect(entries.find((entry) => entry.key === 'pair')?.confirm).toBeNull();
  });

  it('offers only Wake while the computer is offline, and only when it can be woken', () => {
    expect(keys({ ...INPUT, offline: true })).toEqual(['wake', 'pair', 'revoke']);
    expect(keys({ ...INPUT, offline: true, offers: () => false })).toEqual(['pair', 'revoke']);
  });

  it('hides actions the computer does not offer, and owner-only rows from members', () => {
    expect(keys({ ...INPUT, offers: (capability) => capability === 'restart' })).toEqual([
      'restart',
      'pair',
      'revoke',
    ]);
    expect(keys({ ...INPUT, owner: false })).toEqual([
      'restart',
      'shut_down',
      'sign_out',
      'hibernate',
    ]);
    expect(keys({ ...INPUT, canRevoke: false })).not.toContain('revoke');
  });

  it('warns that the hub machine takes everything with it', () => {
    const hub = menuEntries({ ...INPUT, hub: true });
    for (const entry of hub.filter((item) => item.key === 'shut_down' || item.key === 'restart')) {
      expect(entry.confirm?.body.startsWith('This computer runs the hub')).toBe(true);
    }
    const plain = menuEntries(INPUT).find((entry) => entry.key === 'restart');
    expect(plain?.confirm?.body.startsWith('This computer runs the hub')).toBe(false);
  });
});
