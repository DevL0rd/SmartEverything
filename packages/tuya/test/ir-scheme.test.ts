import { describe, expect, it } from 'vitest';
import { IrCodeError, irSchemeOf, irWrites, learnedCode, type IrScheme } from '../src';
import { point } from './fixtures';

const TEXT = { type: 'String', maxLength: 255 } as const;
const HEAD = '010ED80000000000030015004000 80'.replaceAll(' ', '');

const legacy: IrScheme = {
  kind: 'dp201',
  send: { code: 'ir_send', dpId: 201 },
  learned: { code: 'ir_study_code', dpId: 202 },
};

const modern = irSchemeOf([], new Set([1]));

describe('IR blaster schemes', () => {
  it('detects the legacy scheme from data point 201 and names it after the cloud codes', () => {
    expect(
      irSchemeOf([point('send_code', 201, TEXT), point('learned', 202, TEXT)], new Set()),
    ).toStrictEqual({
      kind: 'dp201',
      send: { code: 'send_code', dpId: 201 },
      learned: { code: 'learned', dpId: 202 },
    });
    expect(irSchemeOf([], new Set([201]))).toStrictEqual(legacy);
  });

  it('detects the newer scheme from data point 1 with the standard codes', () => {
    expect(modern).toStrictEqual({
      kind: 'dp1',
      control: { code: 'control', dpId: 1 },
      learned: { code: 'study_code', dpId: 2 },
      head: { code: 'ir_code', dpId: 3 },
      key: { code: 'key_code', dpId: 4 },
      study: { code: 'key_study', dpId: 7 },
      codeType: { code: 'type', dpId: 13 },
    });
    expect(irSchemeOf([point('control', 1, TEXT)], new Set())?.kind).toBe('dp1');
  });

  it('finds no scheme without either control data point', () => {
    expect(irSchemeOf([point('x', 5, TEXT)], new Set([2]))).toBeNull();
  });
});

describe('IR data point writes', () => {
  it('starts and ends learning on the legacy scheme', () => {
    expect(irWrites(legacy, { kind: 'study_start' })).toStrictEqual([
      { code: 'ir_send', dpId: 201, value: '{"control":"study"}' },
    ]);
    expect(irWrites(legacy, { kind: 'study_exit' })).toStrictEqual([
      { code: 'ir_send', dpId: 201, value: '{"control":"study_exit"}' },
    ]);
  });

  it('sends pulses and head and key pairs on the legacy scheme', () => {
    expect(
      irWrites(legacy, { kind: 'send', code: { format: 'pulses', code: 'KCOUETAC' } }),
    ).toStrictEqual([
      {
        code: 'ir_send',
        dpId: 201,
        value: '{"control":"send_ir","type":0,"head":"","key1":"1KCOUETAC"}',
      },
    ]);
    expect(
      irWrites(legacy, {
        kind: 'send',
        code: { format: 'head_key', code: JSON.stringify({ head: HEAD, key: '01@#' }) },
      }),
    ).toStrictEqual([
      {
        code: 'ir_send',
        dpId: 201,
        value: `{"control":"send_ir","type":0,"head":"${HEAD}","key1":"001@#"}`,
      },
    ]);
  });

  it('starts and ends learning on the newer scheme', () => {
    expect(modern).not.toBeNull();
    const scheme = modern ?? legacy;
    expect(irWrites(scheme, { kind: 'study_start' })).toStrictEqual([
      { code: 'control', dpId: 1, value: 'study' },
    ]);
    expect(irWrites(scheme, { kind: 'study_exit' })).toStrictEqual([
      { code: 'control', dpId: 1, value: 'study_exit' },
    ]);
  });

  it('sends pulses and head and key pairs on the newer scheme', () => {
    const scheme = modern ?? legacy;
    expect(
      irWrites(scheme, { kind: 'send', code: { format: 'pulses', code: 'KCOUETAC' } }),
    ).toStrictEqual([
      { code: 'control', dpId: 1, value: 'study_key' },
      { code: 'type', dpId: 13, value: 0 },
      { code: 'key_study', dpId: 7, value: 'KCOUETAC' },
    ]);
    expect(
      irWrites(scheme, {
        kind: 'send',
        code: { format: 'head_key', code: JSON.stringify({ head: HEAD, key: '01@#' }) },
      }),
    ).toStrictEqual([
      { code: 'control', dpId: 1, value: 'send_ir' },
      { code: 'type', dpId: 13, value: 0 },
      { code: 'ir_code', dpId: 3, value: HEAD },
      { code: 'key_code', dpId: 4, value: '01@#' },
    ]);
  });

  it('refuses to write a library key as data points', () => {
    expect(() =>
      irWrites(legacy, { kind: 'send', code: { format: 'library', code: '{}' } }),
    ).toThrow(
      new IrCodeError(
        'library',
        'a library key is sent through the Tuya cloud, not as data points',
      ),
    );
  });
});

describe('learned codes', () => {
  it('reads a learned code by data point id or code, canonicalised', () => {
    expect(learnedCode(legacy, 202, '1KCOUETAC')).toStrictEqual({
      format: 'pulses',
      code: 'KCOUETAC',
    });
    expect(learnedCode(legacy, 'ir_study_code', 'KCOUETAC')).toStrictEqual({
      format: 'pulses',
      code: 'KCOUETAC',
    });
  });

  it('ignores other data points and empty reports', () => {
    expect(learnedCode(legacy, 201, 'KCOUETAC')).toBeNull();
    expect(learnedCode(legacy, 'ir_send', 'KCOUETAC')).toBeNull();
    expect(learnedCode(legacy, 202, '')).toBeNull();
    expect(learnedCode(legacy, 202, 5)).toBeNull();
  });

  it('refuses a learned report that is not a pulse train', () => {
    expect(() => learnedCode(legacy, 202, 'KCOU')).toThrow(IrCodeError);
  });
});
