import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIME_ZONE } from '../src/automations';
import { colorFromInput } from '../src/color-input';
import { PLUGIN_SETTING } from '../src/plugin-settings';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('failures that are not the expected kind are not swallowed', () => {
  it('lets an unexpected error out of colour json parsing', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new TypeError('unexpected json failure');
    });
    expect(() => colorFromInput('{"hue":1}')).toThrow('unexpected json failure');
  });

  it('lets an unexpected error out of time zone checking', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new TypeError('unexpected intl failure');
    });
    expect(() => TIME_ZONE.safeParse('Europe/Berlin')).toThrow('unexpected intl failure');
  });

  it('lets an unexpected error out of item pattern checking', () => {
    const real = RegExp;
    vi.stubGlobal(
      'RegExp',
      class extends real {
        constructor(pattern: string, flags?: string) {
          if (flags === 'u') {
            throw new TypeError('unexpected pattern failure');
          }
          super(pattern, flags);
        }
      },
    );
    expect(() =>
      PLUGIN_SETTING.safeParse({ type: 'list', title: 'Zones', item: { pattern: 'a+' } }),
    ).toThrow('unexpected pattern failure');
  });
});
