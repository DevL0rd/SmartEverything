import { describe, expect, it } from 'vitest';
import { PHONE_SECTIONS, PHONE_SECTION_IDS, frameLayoutOf, railWidthOf } from './sections';

describe('phone sections', () => {
  it('lists the ten pages in the design order', () => {
    expect(PHONE_SECTIONS.map((section) => section.id)).toEqual([...PHONE_SECTION_IDS]);
    expect(PHONE_SECTION_IDS).toEqual([
      'overview',
      'battery',
      'sound',
      'screen',
      'network',
      'storage',
      'apps',
      'notifications',
      'activity',
      'setup',
    ]);
  });

  it('gives every section a label and an icon', () => {
    for (const section of PHONE_SECTIONS) {
      expect(section.label).not.toBe('');
      expect(section.icon).not.toBe('');
    }
  });

  it('uses one column below 600 and an icon rail below 720', () => {
    expect(frameLayoutOf(599)).toBe('compact');
    expect(frameLayoutOf(600)).toBe('icon');
    expect(frameLayoutOf(719)).toBe('icon');
    expect(railWidthOf(719)).toBe('icon');
    expect(frameLayoutOf(720)).toBe('wide');
    expect(railWidthOf(720)).toBe('mid');
    expect(railWidthOf(1023)).toBe('mid');
    expect(railWidthOf(1024)).toBe('wide');
  });
});
