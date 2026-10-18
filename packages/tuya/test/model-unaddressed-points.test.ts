import { describe, expect, it } from 'vitest';
import { buildDeviceModel, reportFromDps } from '../src';
import { BOOL, point } from './fixtures';

describe('data points the cloud lists without a data point id', () => {
  const unaddressed = { ...point('_hidden', 1, BOOL), dpId: null };

  it('keeps a code that is no capability name raw under a key made from its position', () => {
    const model = buildDeviceModel('kg', [unaddressed, point('_other', 5, BOOL)], new Set());
    expect(model.capabilities.map((item) => item.key)).toStrictEqual(['raw:code_0', 'raw:dp_5']);
  });

  it('reads no local report for them', () => {
    const model = buildDeviceModel('kg', [unaddressed, point('switch_1', 1, BOOL)], new Set());
    expect(reportFromDps(model, { '1': true, '2': false })).toStrictEqual({
      report: [{ code: 'switch_1', value: true }],
      unknownDpIds: [2],
    });
  });
});
