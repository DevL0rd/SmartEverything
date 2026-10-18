import { describe, expect, it } from 'vitest';
import { railGroupsOf } from './section-rail';
import { AI_SECTIONS, SECTIONS } from '../model/sections';

const RAIL = {
  deviceId: '00000000-0000-4000-8000-0000000000c1',
  active: 'overview',
  online: true,
  features: undefined,
  os: 'Linux',
  width: 'wide',
} as const;

describe('computer section rail', () => {
  it('lists the sections, then the AI sections under their own heading', () => {
    const groups = railGroupsOf(RAIL);
    expect(groups.map((group) => group.title)).toEqual([null, 'AI on this computer']);
    expect(groups[0]?.entries.map((entry) => entry.id)).toEqual(SECTIONS.map((def) => def.id));
    expect(groups[1]?.entries.map((entry) => entry.id)).toEqual(AI_SECTIONS.map((def) => def.id));
  });

  it('marks a section the computer lacks as missing and keeps the AI sections available', () => {
    const groups = railGroupsOf({ ...RAIL, features: ['cpu'] });
    const missing = groups[0]?.entries.filter((entry) => entry.missing !== null) ?? [];
    expect(missing.map((entry) => entry.id)).toContain('audio');
    expect(missing.every((entry) => entry.missing === 'Not available on Linux yet')).toBe(true);
    expect(groups[1]?.entries.every((entry) => entry.missing === null)).toBe(true);
  });

  it('carries the short label only where a section has one', () => {
    const entries = railGroupsOf(RAIL).flatMap((group) => group.entries);
    expect(entries.find((entry) => entry.id === 'apps')?.short).toBe('Apps');
    expect(entries.find((entry) => entry.id === 'overview')?.short).toBeUndefined();
  });
});
