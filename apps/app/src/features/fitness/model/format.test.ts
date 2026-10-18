import { HC_CODES, hcLabel } from '@smarteverything/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { logFormOf } from '../../health-log';
import { recordSummary } from './format';
import { at, seedRecord } from './test-support';

const CODED_FIELDS = [
  ['OvulationTest', 'result', HC_CODES.ovulationResult],
  ['MenstruationFlow', 'flow', HC_CODES.flow],
  ['CervicalMucus', 'appearance', HC_CODES.mucusAppearance],
  ['SexualActivity', 'protectionUsed', HC_CODES.protection],
] as const;

interface PickerChoice {
  readonly options: readonly { readonly value: number; readonly label: string }[];
  readonly initial: number;
}

function choiceField(type: string, key: string): PickerChoice {
  const field = logFormOf(type)?.fields.find((candidate) => candidate.key === key);
  if (field?.kind !== 'choice') {
    throw new Error(`no choice ${key} on ${type}`);
  }
  return field;
}

function summaryOf(type: string, key: string, value: number): string {
  const defaults = (logFormOf(type)?.fields ?? []).map((field): [string, number] => [
    field.key,
    field.kind === 'choice' ? field.initial : 0,
  ]);
  const data = { ...Object.fromEntries(defaults), [key]: value };
  return recordSummary(seedRecord({ type, start: at(10, 8), data }));
}

describe('log form results read back as picked', () => {
  it('stores the default ovulation result as Negative, code 3', () => {
    const { initial } = choiceField('OvulationTest', 'result');
    expect(initial).toBe(3);
    expect(summaryOf('OvulationTest', 'result', initial)).toBe('Negative');
  });

  it('reads a positive ovulation test as Positive', () => {
    expect(summaryOf('OvulationTest', 'result', 1)).toBe('Positive');
  });

  it.each(CODED_FIELDS)('%s: every picker choice reads back as itself', (type, key, codes) => {
    const { options } = choiceField(type, key);
    fc.assert(
      fc.property(fc.constantFrom(...options), (option) => {
        const summary = summaryOf(type, key, option.value);
        expect(summary).toBe(hcLabel(codes, option.value));
        if (option.value !== 0 || type === 'OvulationTest') {
          expect(summary).toContain(option.label);
        }
      }),
    );
  });
});
