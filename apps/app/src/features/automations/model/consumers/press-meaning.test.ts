import { NODE_REGISTRY } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { actsOnSomething, meaningOf } from './press-meaning';
import {
  KITCHEN,
  LIVING,
  VALUE,
  buttonTrigger,
  lit,
  program,
  row,
  setPower,
  step,
  trigger,
} from './consumer-fixtures';

const kinds = NODE_REGISTRY.get;

const ROWS = [
  row(
    'a',
    'Kitchen switch - press cycles brightness',
    program([buttonTrigger(KITCHEN, 'single_press')], [setPower(1, LIVING, true)]),
  ),
  row(
    'b',
    'Kitchen switch - long press off',
    program([buttonTrigger(KITCHEN, 'long_press')], [setPower(1, LIVING, false)]),
  ),
  row(
    'c',
    'Living room switch - press',
    program([buttonTrigger(LIVING, 'single_press')], [setPower(1, LIVING, true)]),
  ),
];

describe('what a button does', () => {
  it('reads press and hold of the kitchen switch', () => {
    const meaning = meaningOf(ROWS, KITCHEN, kinds);
    expect(meaning.map((entry) => entry.gestures)).toEqual([['single'], ['long']]);
    expect(meaning.map((entry) => entry.name)).toEqual([
      'Kitchen switch - press cycles brightness',
      'Kitchen switch - long press off',
    ]);
  });

  it('keeps one button apart from another', () => {
    expect(meaningOf(ROWS, LIVING, kinds).map((entry) => entry.automationId)).toEqual(['c']);
    expect(meaningOf(ROWS, '00000000-0000-4000-8000-999999999999', kinds)).toEqual([]);
  });

  it('reads a migrated signal trigger the same as a button trigger', () => {
    const signal = trigger(1, 'trigger.signal', {
      source: lit('event'),
      kind: lit('button'),
      subject: lit(KITCHEN),
      match: lit({ action: 'single_press' }),
    });
    const migrated = row('m', 'Migrated', program([signal], [setPower(1, LIVING, true)]));
    expect(meaningOf([migrated], KITCHEN, kinds)).toEqual(
      meaningOf([ROWS[0] ?? migrated], KITCHEN, kinds).map((entry) => ({
        ...entry,
        automationId: 'm',
        name: 'Migrated',
      })),
    );
  });

  it('leaves out automations that only keep notes', () => {
    const notes = row(
      'n',
      'Hands off',
      program(
        [buttonTrigger(KITCHEN, 'single_press')],
        [step(1, 'var.set', { source: lit('home'), name: lit(VALUE), value: lit(1) })],
      ),
    );
    expect(actsOnSomething(notes.definition, kinds)).toBe(false);
    expect(meaningOf([notes], KITCHEN, kinds)).toEqual([]);
  });

  it('leaves out switched-off automations and switched-off triggers', () => {
    const [first] = ROWS;
    if (first === undefined) throw new Error('Expected a row');
    expect(meaningOf([{ ...first, enabled: false }], KITCHEN, kinds)).toEqual([]);
    const muted = row(
      'x',
      'Muted',
      program(
        [{ ...buttonTrigger(KITCHEN, 'single_press'), enabled: false }],
        [setPower(1, LIVING, true)],
      ),
    );
    expect(meaningOf([muted], KITCHEN, kinds)).toEqual([]);
  });

  it('counts every gesture when a trigger names no press', () => {
    const any = row(
      'any',
      'Any press',
      program([buttonTrigger(KITCHEN)], [setPower(1, LIVING, true)]),
    );
    expect(meaningOf([any], KITCHEN, kinds)[0]?.gestures).toEqual(['single', 'double', 'long']);
  });

  it('counts a call to a reusable function as acting', () => {
    const call = row(
      'call',
      'Calls',
      program([buttonTrigger(KITCHEN, 'single_press')], [step(1, 'fn.call', { fn: lit('f') })]),
    );
    expect(actsOnSomething(call.definition, kinds)).toBe(true);
  });
});
