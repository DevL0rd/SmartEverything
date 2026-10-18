import { describe, expect, it } from 'vitest';
import { LAUNDRY_PROGRAMS, dialPrograms, laundryProgramByRaw } from '@smarteverything/domain';
import { chipPrograms, morePrograms, programSections, selectedIndex } from './programs';

const DIAL_HEX = '0E18030B04120F113E44080D07494798';
const DIAL = dialPrograms(DIAL_HEX);
const ECO = laundryProgramByRaw('ECO4060');
const DELICATE = laundryProgramByRaw('Delicate Wash');
const HEAVY = laundryProgramByRaw('Heavy Wash');

describe('laundry program picker order', () => {
  it('decodes the 14 dial programs from the live value', () => {
    expect(DIAL).toHaveLength(14);
  });

  it('lists the dial programs in dial order, then the rest', () => {
    const sections = programSections(DIAL, '');
    expect(sections[0]?.title).toBe('On your machine');
    expect(sections[0]?.programs.map((entry) => entry.id)).toEqual(DIAL.map((entry) => entry.id));
    expect(sections.slice(1).map((section) => section.title)).toEqual([
      'Everyday',
      'Fabric',
      'Care',
      'Drying',
      'Machine',
    ]);
  });

  it('shows every one of the 34 programs exactly once', () => {
    const ids = programSections(DIAL, '').flatMap((section) =>
      section.programs.map((entry) => entry.id),
    );
    expect(ids).toHaveLength(LAUNDRY_PROGRAMS.length);
    expect(new Set(ids).size).toBe(LAUNDRY_PROGRAMS.length);
    expect(morePrograms(DIAL)).toHaveLength(LAUNDRY_PROGRAMS.length - DIAL.length);
  });

  it('keeps the chips to the dial, and puts a selected non-dial program first', () => {
    expect(chipPrograms(DIAL, ECO)).toBe(DIAL);
    const chips = chipPrograms(DIAL, HEAVY);
    expect(chips[0]).toBe(HEAVY);
    expect(chips.slice(1)).toEqual(DIAL);
  });

  it('finds the section that holds the selected program, so the sheet can scroll to it', () => {
    const sections = programSections(DIAL, '');
    expect(sections[selectedIndex(sections, ECO)]?.title).toBe('On your machine');
    expect(sections[selectedIndex(sections, HEAVY)]?.title).toBe('Everyday');
    expect(selectedIndex(sections, undefined)).toBe(-1);
  });

  it('filters by name and drops empty sections', () => {
    const sections = programSections(DIAL, 'wool');
    expect(sections.map((section) => section.title)).toEqual(['On your machine']);
    expect(programSections(DIAL, 'zzz')).toEqual([]);
    expect(programSections(DIAL, 'DELICATE')[0]?.programs[0]).toBe(DELICATE);
  });

  it('shows every program in groups when the dial cannot be decoded', () => {
    const sections = programSections(dialPrograms('nonsense'), '');
    expect(sections.map((section) => section.title)).not.toContain('On your machine');
    expect(sections.flatMap((section) => section.programs)).toHaveLength(LAUNDRY_PROGRAMS.length);
  });
});
