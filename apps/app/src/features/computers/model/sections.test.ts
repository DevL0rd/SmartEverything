import { describe, expect, it } from 'vitest';
import { AI_SECTIONS, SECTIONS, NOT_AVAILABLE, offersSection, type SectionDef } from './sections';

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
    expect(AI_SECTIONS.map((section) => section.id)).toEqual(['claude', 'codex']);
  });

  it('offers a section only when the computer offers its feature, and everything while loading', () => {
    const audio = find('audio');
    expect(audio !== undefined && offersSection(audio, ['audio'])).toBe(true);
    expect(audio !== undefined && offersSection(audio, ['cpu'])).toBe(false);
    expect(audio !== undefined && offersSection(audio, undefined)).toBe(true);
    const overview = find('overview');
    expect(overview !== undefined && offersSection(overview, [])).toBe(true);
  });

  it('says a missing section is missing on this computer, never on its operating system', () => {
    expect(NOT_AVAILABLE).toBe('Not available on this computer yet');
  });
});
