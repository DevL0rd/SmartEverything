import { describe, expect, it } from 'vitest';
import { INTERNET_WIDGET_SIZES, PEOPLE_WIDGET_SIZES } from './frame-faces';

describe('widget sizes', () => {
  it('offers Wide for Internet only where it differs from Medium, and never for people', () => {
    expect(INTERNET_WIDGET_SIZES.compact).not.toContain('W');
    expect(INTERNET_WIDGET_SIZES.medium).toContain('W');
    expect(INTERNET_WIDGET_SIZES.expanded).toContain('W');
    expect(Object.values(PEOPLE_WIDGET_SIZES).flat()).not.toContain('W');
  });
});
