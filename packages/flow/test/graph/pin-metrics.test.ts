import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  GROUP_HEADING_H,
  VALUE_HEAD_H,
  VALUE_ROW_H,
  outputRows,
  pinRowsHeight,
  referencedOutputs,
  startRowsHeight,
  valueCardHeight,
} from '../../src/graph/pin-metrics';
import { programSizes } from '../../src/graph/metrics';
import { automation, idOf, start, step, value } from './graph-fixtures';
import { PLUGIN_LOOKUP, PLUGIN_STEP, PLUGIN_VALUE } from './plugin-lookup';

const NONE: ReadonlySet<string> = new Set();

describe('pin rows in the card sizes', () => {
  it('shows the set inputs and folds every unwired output into one more row', () => {
    const plain = pinRowsHeight({ kind: 'device.set' }, NONE, STATIC_KIND_LOOKUP);
    const extra = pinRowsHeight(
      { kind: 'device.set', ports: { extra: { lit: 1 } } },
      NONE,
      STATIC_KIND_LOOKUP,
    );
    expect(extra - plain).toBe(VALUE_ROW_H);
    const after = pinRowsHeight(
      { kind: 'device.set', outputs: [{ name: 'after', values: {} }] },
      NONE,
      STATIC_KIND_LOOKUP,
    );
    expect(after).toBe(plain);
  });

  it('shows a wired output with its group heading', () => {
    const subject = { kind: 'device.set', outputs: [{ name: 'after', values: {} }] };
    const wired = pinRowsHeight(subject, new Set(['after']), STATIC_KIND_LOOKUP);
    expect(wired - pinRowsHeight(subject, NONE, STATIC_KIND_LOOKUP)).toBe(
      VALUE_ROW_H + GROUP_HEADING_H,
    );
  });

  it('puts the pins of a value card below its title', () => {
    const constant = { kind: 'var.constant', ports: { value: { lit: 1 } } };
    expect(valueCardHeight(constant, new Set(['value']), STATIC_KIND_LOOKUP)).toBe(
      VALUE_HEAD_H + VALUE_ROW_H,
    );
    expect(valueCardHeight(constant, NONE, STATIC_KIND_LOOKUP)).toBe(
      VALUE_HEAD_H + 2 * VALUE_ROW_H,
    );
  });

  it('finds the outputs other nodes read', () => {
    const program = automation([
      start('a'),
      value('v'),
      step('a', undefined, { ports: { to: { wire: { from: 'v', port: 'value' } } } }),
    ]);
    expect([...(referencedOutputs(program).get('v') ?? [])]).toEqual(['value']);
  });

  it('adds the admit row to Start of an automation', () => {
    const program = automation([start('a'), step('a')]);
    expect(startRowsHeight(program)).toBe(VALUE_ROW_H);
    const sizes = programSizes(program, 'touch', STATIC_KIND_LOOKUP);
    expect(sizes.get(idOf('start'))?.h).toBe(56 + VALUE_ROW_H);
  });
});

describe('pin rows with a lookup that knows plugin kinds', () => {
  it('counts the declared inputs of a plugin step as required rows only when set', () => {
    const subject = { kind: PLUGIN_STEP, ports: { level: { lit: 1 } } };
    expect(pinRowsHeight(subject, NONE, PLUGIN_LOOKUP)).toBe(
      pinRowsHeight({ kind: PLUGIN_STEP }, NONE, PLUGIN_LOOKUP) + VALUE_ROW_H,
    );
  });

  it('sees no declared rows for a plugin kind under the static lookup', () => {
    const subject = { kind: PLUGIN_STEP, ports: { level: { lit: 1 } } };
    const known = outputRows(subject, NONE, PLUGIN_LOOKUP);
    const unknown = outputRows(subject, NONE, STATIC_KIND_LOOKUP);
    expect(known.more).toBe(1);
    expect(unknown.more).toBe(0);
  });

  it('sizes a plugin value card from its own pins', () => {
    const subject = { kind: PLUGIN_VALUE, ports: { level: { lit: 1 } } };
    expect(valueCardHeight(subject, NONE, PLUGIN_LOOKUP)).toBeGreaterThan(
      valueCardHeight(subject, NONE, STATIC_KIND_LOOKUP),
    );
  });
});
