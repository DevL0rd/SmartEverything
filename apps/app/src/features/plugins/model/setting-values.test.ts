import { describe, expect, it } from 'vitest';
import {
  PLUGIN_ROW,
  PLUGIN_SETTING,
  type JsonValue,
  type PluginRow,
} from '@smarteverything/domain';
import {
  itemsProblem,
  listItems,
  numberProblem,
  settingText,
  settingValue,
  shownValue,
  typedItems,
} from './setting-values';

function row(settings: Record<string, JsonValue>, secrets: string[] = []): PluginRow {
  return PLUGIN_ROW.parse({
    id: 'demo',
    manifest: {
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      description: 'A demo',
      publisher: 'Test',
    },
    source: 'local',
    location: null,
    enabled: true,
    trusted: true,
    status: 'running',
    status_detail: null,
    tool_switches: {},
    settings,
    secret_names: secrets,
    icon_url: null,
    installed_at: '2026-10-16T00:00:00.000Z',
    updated_at: '2026-10-16T00:00:00.000Z',
  });
}

const NAME = PLUGIN_SETTING.parse({ type: 'string', title: 'Name', default: 'Home' });
const SECRET = PLUGIN_SETTING.parse({ type: 'string', title: 'Key', secret: true });
const LIMIT = PLUGIN_SETTING.parse({
  type: 'number',
  title: 'Limit',
  minimum: 1,
  maximum: 10,
  default: 5,
});
const LIST = PLUGIN_SETTING.parse({
  type: 'list',
  title: 'Hosts',
  maxItems: 3,
  item: { pattern: '[a-z]+', maxLength: 5 },
  default: ['abc'],
});

describe('settingValue and settingText', () => {
  it('uses the stored value and falls back to the default of the setting', () => {
    expect(settingValue(row({ name: 'Cabin' }), 'name', NAME)).toBe('Cabin');
    expect(settingValue(row({}), 'name', NAME)).toBe('Home');
  });

  it('writes null as empty, objects as JSON and the rest as plain text', () => {
    expect(settingText(null)).toBe('');
    expect(settingText({ a: 1 })).toBe('{"a":1}');
    expect(settingText(['x'])).toBe('["x"]');
    expect(settingText(12)).toBe('12');
    expect(settingText(true)).toBe('true');
  });
});

describe('shownValue', () => {
  it('shows a secret only as set or not set', () => {
    if (SECRET.type !== 'string' || NAME.type !== 'string') {
      throw new Error('setup');
    }
    expect(shownValue(row({}, ['key']), 'key', SECRET)).toBe('Set');
    expect(shownValue(row({}), 'key', SECRET)).toBe('Not set');
    expect(shownValue(row({ name: '' }), 'name', { ...NAME, default: null })).toBe('Not set');
    expect(shownValue(row({ name: 'Cabin' }), 'name', NAME)).toBe('Cabin');
  });
});

describe('numberProblem', () => {
  it('accepts a number inside the bounds and says which bound a number breaks', () => {
    if (LIMIT.type !== 'number') {
      throw new Error('setup');
    }
    expect(numberProblem(LIMIT, '5')).toBeNull();
    expect(numberProblem(LIMIT, '1')).toBeNull();
    expect(numberProblem(LIMIT, '10')).toBeNull();
    expect(numberProblem(LIMIT, '0')).toBe('Use 1 or more');
    expect(numberProblem(LIMIT, '11')).toBe('Use 10 or less');
    expect(numberProblem(LIMIT, 'abc')).toBe('Enter a number');
    expect(numberProblem(LIMIT, 'Infinity')).toBe('Enter a number');
  });

  it('has no bound when the setting sets none', () => {
    const open = PLUGIN_SETTING.parse({ type: 'number', title: 'Any' });
    if (open.type !== 'number') {
      throw new Error('setup');
    }
    expect(numberProblem(open, '-99999')).toBeNull();
  });
});

describe('list settings', () => {
  it('reads only the text items of the stored list, or the default', () => {
    if (LIST.type !== 'list') {
      throw new Error('setup');
    }
    expect(listItems(row({ hosts: ['a', 'b', 3, null] }), 'hosts', LIST)).toEqual(['a', 'b']);
    expect(listItems(row({}), 'hosts', LIST)).toEqual(['abc']);
    expect(listItems(row({ hosts: 'a,b' }), 'hosts', LIST)).toEqual([]);
  });

  it('splits typed text on commas and new lines, trimmed, without blanks or repeats', () => {
    expect(typedItems(' a, b\nc ,,\n b ')).toEqual(['a', 'b', 'c']);
    expect(typedItems('  ')).toEqual([]);
  });

  it('refuses an item already in the list, too many items, and an item that does not fit', () => {
    if (LIST.type !== 'list') {
      throw new Error('setup');
    }
    expect(itemsProblem(LIST, ['abc'], 'def')).toBeNull();
    expect(itemsProblem(LIST, ['abc'], 'abc')).toBe('abc is already in the list');
    expect(itemsProblem(LIST, ['abc', 'def'], 'x, y')).toBe('The list holds up to 3 items');
    expect(itemsProblem(LIST, [], 'abcdefg')).toBe('abcdefg: Use 1 to 5 characters');
    expect(itemsProblem(LIST, [], 'ABC')).toBe('ABC: That is not in the expected form');
  });
});
