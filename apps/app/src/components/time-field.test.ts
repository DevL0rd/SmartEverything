import { describe, expect, it, vi } from 'vitest';
import { localeUsesHour12 } from './time-field';

describe('localeUsesHour12', () => {
  it('reads the locale once, not on every call', () => {
    const created = vi.spyOn(Intl, 'DateTimeFormat');
    const first = localeUsesHour12();
    for (let call = 0; call < 50; call += 1) {
      localeUsesHour12();
    }
    expect(localeUsesHour12()).toBe(first);
    expect(created).not.toHaveBeenCalled();
    created.mockRestore();
  });
});
