import { describe, expect, it } from 'vitest';
import { phoneTabsOf, sectionsPullUp } from '../../../components/page-shell/shell-sections';
import { computerSectionsOf, railGroupsOf } from './computer-sections';
import { AI_SECTIONS, NOT_AVAILABLE, SECTIONS } from '../model/sections';

const INPUT = {
  deviceId: '00000000-0000-4000-8000-0000000000c1',
  active: 'overview',
  online: true,
  features: undefined,
} as const;

describe('computer sections', () => {
  it('lists the sections, then the AI sections under their own heading', () => {
    const groups = railGroupsOf(INPUT);
    expect(groups.map((group) => group.title)).toEqual([null, 'AI on this computer']);
    expect(groups[0]?.entries.map((entry) => entry.id)).toEqual(SECTIONS.map((def) => def.id));
    expect(groups[1]?.entries.map((entry) => entry.id)).toEqual(AI_SECTIONS.map((def) => def.id));
  });

  it('marks a section the computer lacks as missing and keeps the AI sections available', () => {
    const groups = railGroupsOf({ ...INPUT, features: ['cpu'] });
    const missing = groups[0]?.entries.filter((entry) => entry.missing !== null) ?? [];
    expect(missing.map((entry) => entry.id)).toContain('audio');
    expect(missing.every((entry) => entry.missing === NOT_AVAILABLE)).toBe(true);
    expect(groups[1]?.entries.every((entry) => entry.missing === null)).toBe(true);
  });

  it('carries the short label only where a section has one', () => {
    const entries = railGroupsOf(INPUT).flatMap((group) => group.entries);
    expect(entries.find((entry) => entry.id === 'apps')?.short).toBe('Apps');
    expect(entries.find((entry) => entry.id === 'overview')?.short).toBeUndefined();
  });

  it('opens the pull-up on phones and pins the most used pages as tabs that replace the page', () => {
    const sections = computerSectionsOf(INPUT);
    expect(sectionsPullUp(sections)).toBe(true);
    const tabs = phoneTabsOf(sections);
    expect(tabs?.items.map((item) => item.key)).toEqual([
      'overview',
      'performance',
      'processes',
      'files',
      'apps',
    ]);
    expect(tabs?.items.every((item) => item.navigation === 'replace')).toBe(true);
  });

  it('adds the open page to the phone tabs when it is not pinned', () => {
    const tabs = phoneTabsOf(computerSectionsOf({ ...INPUT, active: 'codex' }));
    expect(tabs?.active).toBe('codex');
    expect(tabs?.items.map((item) => item.key)).toContain('codex');
  });
});
