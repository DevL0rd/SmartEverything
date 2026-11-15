import { describe, expect, it } from 'vitest';
import { PHONE_SECTIONS, PHONE_SECTION_IDS } from './sections';

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
});
