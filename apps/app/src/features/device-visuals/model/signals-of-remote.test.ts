import type { DeviceFamily } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { VisualState } from '../types';
import { signalsOf } from './signals-of';
import { expectSignals, sample } from './signals-of-fixtures';

type IrCategory = NonNullable<VisualState['ir']>['category'];

const IR_CATEGORIES: readonly IrCategory[] = [
  'ac',
  'fan',
  'light',
  'speaker',
  'projector',
  'settop',
  'tv',
  'other',
];

function remote(category: IrCategory, on: boolean | null, failed = false): VisualState {
  return sample({
    power: 'unknown',
    ir: { category, on, assumed: true, failed, sentAt: null },
  });
}

describe('ir_remote', () => {
  it.each([
    ['tv', 'screenOn'],
    ['projector', 'screenOn'],
    ['speaker', 'playing'],
    ['light', 'lamp'],
  ] as const)('lights the %s through %s', (category, signal) => {
    expectSignals('ir_remote', remote(category, true), {
      power: true,
      online: true,
      mode: category,
      fault: false,
      [signal]: true,
    });
  });

  it.each(['ac', 'fan', 'settop', 'other'] as const)(
    'reports only its power for %s',
    (category) => {
      expectSignals('ir_remote', remote(category, true), {
        power: true,
        online: true,
        mode: category,
        fault: false,
      });
    },
  );

  it('is off', () => {
    expectSignals('ir_remote', remote('tv', false), {
      power: false,
      online: true,
      mode: 'tv',
      fault: false,
      screenOn: false,
    });
  });

  it('keeps power unknown until the first command', () => {
    expectSignals('ir_remote', remote('fan', null), { online: true, mode: 'fan', fault: false });
  });

  it('reports a failed send', () => {
    expectSignals('ir_remote', remote('light', null, true), {
      online: true,
      mode: 'light',
      fault: true,
      lamp: false,
    });
  });

  it.each(IR_CATEGORIES)('names the %s category as its mode', (category) => {
    expect(signalsOf('ir_remote', remote(category, true)).mode).toBe(category);
  });
});

describe('ir_blaster', () => {
  it('reports a failed send', () => {
    expectSignals(
      'ir_blaster',
      sample({ ir: { category: 'other', on: null, assumed: false, failed: true, sentAt: null } }),
      { power: true, online: true, fault: true },
    );
  });

  it('works before its facts arrive', () => {
    expectSignals('ir_blaster', sample({}), { power: true, online: true });
  });
});

describe('families without facts of their own', () => {
  it.each(['gateway', 'router', 'dns_filter', 'computer', 'generic'] as const)(
    '%s reports power and online',
    (family: DeviceFamily) => {
      expectSignals(family, sample({}), { power: true, online: true });
    },
  );
});
