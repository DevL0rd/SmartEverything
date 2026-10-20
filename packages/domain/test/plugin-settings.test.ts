import { describe, expect, it } from 'vitest';
import {
  PLUGIN_SETTING,
  listItemProblem,
  settingFits,
  type PluginListSetting,
  type PluginSetting,
} from '../src/plugin-settings';

function parsed(input: Readonly<Record<string, unknown>>): PluginSetting {
  return PLUGIN_SETTING.parse({ title: 'Setting', ...input });
}

function list(input: Readonly<Record<string, unknown>>): PluginListSetting {
  const setting = parsed({ type: 'list', ...input });
  if (setting.type !== 'list') {
    throw new Error('expected a list setting');
  }
  return setting;
}

describe('a list setting definition', () => {
  it('refuses an item pattern that is not a regular expression', () => {
    const result = PLUGIN_SETTING.safeParse({
      type: 'list',
      title: 'Zones',
      item: { pattern: '(' },
    });
    expect(result.success).toBe(false);
  });

  it('fills the item rules and limits when none are given', () => {
    const setting = list({});
    expect(setting.item).toStrictEqual({ pattern: null, maxLength: 200 });
    expect(setting.maxItems).toBe(100);
    expect(setting.default).toStrictEqual([]);
  });
});

describe('listItemProblem', () => {
  const setting = list({ item: { pattern: '[a-z]+', maxLength: 5 } });

  it('names the length range for an empty or overlong item', () => {
    expect(listItemProblem(setting, '')).toBe('Use 1 to 5 characters');
    expect(listItemProblem(setting, 'abcdef')).toBe('Use 1 to 5 characters');
  });

  it('requires the whole item to match the pattern', () => {
    expect(listItemProblem(setting, 'abc')).toBeNull();
    expect(listItemProblem(setting, 'abc1')).toBe('That is not in the expected form');
    expect(listItemProblem(setting, '1abc')).toBe('That is not in the expected form');
  });

  it('accepts any item within the length when there is no pattern', () => {
    expect(listItemProblem(list({}), 'anything at all')).toBeNull();
  });
});

describe('settingFits', () => {
  it('fits strings only up to 2000 characters', () => {
    const setting = parsed({ type: 'string' });
    expect(settingFits(setting, 'x'.repeat(2000))).toBe(true);
    expect(settingFits(setting, 'x'.repeat(2001))).toBe(false);
    expect(settingFits(setting, 3)).toBe(false);
  });

  it('fits numbers inside the inclusive bounds', () => {
    const setting = parsed({ type: 'number', minimum: 1, maximum: 10 });
    expect(settingFits(setting, 1)).toBe(true);
    expect(settingFits(setting, 10)).toBe(true);
    expect(settingFits(setting, 0.5)).toBe(false);
    expect(settingFits(setting, 10.5)).toBe(false);
    expect(settingFits(setting, '5')).toBe(false);
  });

  it('fits any number when the bounds are open', () => {
    expect(settingFits(parsed({ type: 'number' }), -1e9)).toBe(true);
  });

  it('fits booleans only', () => {
    const setting = parsed({ type: 'boolean' });
    expect(settingFits(setting, false)).toBe(true);
    expect(settingFits(setting, 'true')).toBe(false);
  });

  it('fits only a listed option of an enum', () => {
    const setting = parsed({
      type: 'enum',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' },
      ],
    });
    expect(settingFits(setting, 'high')).toBe(true);
    expect(settingFits(setting, 'mid')).toBe(false);
  });

  it('fits a list of unique valid strings within the item count', () => {
    const setting = list({ maxItems: 2, item: { pattern: '[a-z]+' } });
    expect(settingFits(setting, ['a', 'b'])).toBe(true);
    expect(settingFits(setting, ['a', 'b', 'c'])).toBe(false);
    expect(settingFits(setting, ['a', 'a'])).toBe(false);
    expect(settingFits(setting, ['a', 'B'])).toBe(false);
    expect(settingFits(setting, ['a', 1])).toBe(false);
    expect(settingFits(setting, 'a')).toBe(false);
  });
});
