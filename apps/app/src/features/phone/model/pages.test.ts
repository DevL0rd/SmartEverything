import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';
import { phonePages } from './pages';
import { PHONE_SECTION_IDS } from './sections';

function deviceOfKind(kind: Device['kind']): Device {
  return deviceFixture(0, { kind });
}

describe('phone pages', () => {
  it('contributes the ten pages for a phone, in order', () => {
    expect(phonePages(deviceOfKind('phone')).map((page) => page.id)).toEqual([
      ...PHONE_SECTION_IDS,
    ]);
  });

  it('contributes nothing for other kinds', () => {
    expect(phonePages(deviceOfKind('computer'))).toEqual([]);
    expect(phonePages(deviceOfKind('light'))).toEqual([]);
  });

  it('gives every page search words and settings', () => {
    for (const page of phonePages(deviceOfKind('phone'))) {
      expect(page.keywords.length).toBeGreaterThan(2);
      expect(page.settings.length).toBeGreaterThan(0);
    }
  });
});
