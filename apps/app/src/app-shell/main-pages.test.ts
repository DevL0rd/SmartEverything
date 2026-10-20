import { NAV_SECTIONS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MAIN_PAGES, mainPageSettings } from './main-pages';

describe('the settings link of each main page', () => {
  it('opens the settings index from Home', () => {
    expect(mainPageSettings('home')).toEqual({ href: '/settings', label: 'Settings' });
  });

  it('is labelled with the title of the settings page it opens', () => {
    expect(mainPageSettings('cameras').label).toBe('Camera settings');
    expect(mainPageSettings('devices').label).toBe('Device settings');
    expect(mainPageSettings('fitness').label).toBe('Fitness settings');
    expect(mainPageSettings('talk').label).toBe('Walkie-talkie settings');
    expect(mainPageSettings('automations').label).toBe('Automation settings');
  });

  it('has a settings page for every main page', () => {
    for (const page of MAIN_PAGES) {
      expect(() => mainPageSettings(page.tab)).not.toThrow();
    }
  });
});

describe('the default navigation order', () => {
  it('lists the same pages as the domain navigation sections', () => {
    expect(MAIN_PAGES.map((page) => page.tab)).toEqual([...NAV_SECTIONS]);
  });
});
