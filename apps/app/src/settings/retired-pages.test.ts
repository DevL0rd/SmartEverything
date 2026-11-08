import { describe, expect, it } from 'vitest';
import { APP_UPDATES_PAGE } from '../features/app-updates/settings';
import { retiredPageTarget } from './retired-pages';

describe('retired settings pages', () => {
  it('opens App updates when an OTA restart restores its former Settings route', () => {
    expect(retiredPageTarget('about/updates')).toBe(APP_UPDATES_PAGE);
    expect(retiredPageTarget('server/updates')).toBe(APP_UPDATES_PAGE);
    expect(retiredPageTarget(APP_UPDATES_PAGE)).toBeNull();
    expect(retiredPageTarget('about')).toBeNull();
  });
});
