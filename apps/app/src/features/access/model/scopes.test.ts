import { describe, expect, it } from 'vitest';
import { MCP_TOOL_AREAS, TEMPLATE_SCOPES } from '@smarteverything/domain';
import {
  areasText,
  budgetOf,
  budgetText,
  channelsText,
  devicesText,
  modelsText,
  templateChange,
  toggled,
  usdOf,
} from './scopes';

describe('toggled', () => {
  it('adds an id that is not in the list and removes one that is', () => {
    expect(toggled(['a'], 'b')).toStrictEqual(['a', 'b']);
    expect(toggled(['a', 'b'], 'a')).toStrictEqual(['b']);
  });
});

describe('templateChange', () => {
  it('replaces the stored choices with the usual ones of that kind of person', () => {
    expect(templateChange('child')).toStrictEqual({
      template: 'child',
      scopes: TEMPLATE_SCOPES.child,
    });
  });
});

describe('summaries', () => {
  it('say everything, nothing or a count for the parts of the app', () => {
    expect(areasText([...MCP_TOOL_AREAS])).toBe('Everything');
    expect(areasText([])).toBe('Nothing');
    expect(areasText(['home', 'devices'])).toBe(`2 of ${String(MCP_TOOL_AREAS.length)}`);
  });

  it('name how the devices are limited', () => {
    expect(devicesText({ mode: 'all', rooms: [], devices: [] })).toBe('All devices');
    expect(devicesText({ mode: 'only', rooms: ['r'], devices: ['d'] })).toBe(
      'Only 2 rooms and devices',
    );
    expect(devicesText({ mode: 'except', rooms: ['r'], devices: [] })).toBe(
      'All except 1 room or device',
    );
  });

  it('name the model and channel limits', () => {
    expect(modelsText({ mode: 'default', ids: [] })).toBe('Any model');
    expect(modelsText({ mode: 'only', ids: ['a', 'b'] })).toBe('Only 2 models');
    expect(channelsText({ mode: 'all', ids: [] })).toBe('All channels');
    expect(channelsText({ mode: 'only', ids: ['c'] })).toBe('Only 1 channel');
  });
});

describe('usdOf', () => {
  it('reads an empty field as no limit and refuses anything outside the allowed range', () => {
    expect(usdOf('  ')).toStrictEqual({ kind: 'none' });
    expect(usdOf('2.5')).toStrictEqual({ kind: 'amount', usd: 2.5 });
    expect(usdOf('0')).toStrictEqual({ kind: 'invalid' });
    expect(usdOf('abc')).toStrictEqual({ kind: 'invalid' });
    expect(usdOf('100001')).toStrictEqual({ kind: 'invalid' });
  });
});

describe('budgetOf', () => {
  it('is no budget when both fields are empty and invalid when one is wrong', () => {
    expect(budgetOf({ kind: 'none' }, { kind: 'none' }, true, 80)).toBeNull();
    expect(budgetOf({ kind: 'invalid' }, { kind: 'none' }, true, 80)).toBe('invalid');
  });

  it('keeps the warning level and the stop choice', () => {
    expect(budgetOf({ kind: 'amount', usd: 1 }, { kind: 'none' }, false, 70)).toStrictEqual({
      daily_usd: 1,
      monthly_usd: null,
      warn_at_percent: 70,
      hard_stop: false,
    });
  });

  it('reads back as text', () => {
    expect(budgetText(null)).toBe('No limit');
    expect(
      budgetText({ daily_usd: 1, monthly_usd: 20, warn_at_percent: 80, hard_stop: true }),
    ).toBe('$1 a day, $20 a month');
  });
});
