import { describe, expect, it } from 'vitest';
import {
  AI_SECTIONS,
  SECTIONS,
  bodyWidthOf,
  frameLayoutOf,
  notAvailableOn,
  offersSection,
  railWidthOf,
  twoColumnsAt,
  type SectionDef,
} from './sections';

const find = (id: string): SectionDef | undefined => SECTIONS.find((section) => section.id === id);

describe('sections', () => {
  it('lists the ten computer sections in the design order, then the AI pages', () => {
    expect(SECTIONS.map((section) => section.id)).toEqual([
      'overview',
      'performance',
      'processes',
      'audio',
      'displays',
      'files',
      'apps',
      'network',
      'storage',
      'system',
    ]);
    expect(AI_SECTIONS.map((section) => section.id)).toEqual([
      'claude',
      'codex',
      'claude-sessions',
    ]);
  });

  it('offers a section only when the computer offers its feature, and everything while loading', () => {
    const audio = find('audio');
    expect(audio !== undefined && offersSection(audio, ['audio'])).toBe(true);
    expect(audio !== undefined && offersSection(audio, ['cpu'])).toBe(false);
    expect(audio !== undefined && offersSection(audio, undefined)).toBe(true);
    const overview = find('overview');
    expect(overview !== undefined && offersSection(overview, [])).toBe(true);
  });

  it('says which system a missing section is missing on', () => {
    expect(notAvailableOn('Windows')).toBe('Not available on Windows yet');
    expect(notAvailableOn(null)).toBe('Not available yet');
  });

  it('keeps the computer frame at a compact page to 600, an icon rail to 900 and a full rail beyond', () => {
    expect([599, 600, 899, 900].map(frameLayoutOf)).toEqual(['compact', 'icon', 'icon', 'wide']);
    expect([840, 960, 1440].map(railWidthOf)).toEqual(['icon', 'mid', 'wide']);
    expect([390, 800, 1440].map(bodyWidthOf)).toEqual([358, 800 - 96 - 48, 1440 - 260 - 48]);
    expect([599, 800, 1440].map(twoColumnsAt)).toEqual([false, true, true]);
  });
});
