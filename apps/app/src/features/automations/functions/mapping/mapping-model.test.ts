import { describe, expect, it } from 'vitest';
import type {
  AutomationFunctionChange,
  AutomationFunctionInterface,
  AutomationFunctionUser,
} from '@smarteverything/domain';
import {
  INITIAL_STATE,
  mappingCards,
  type MappingEntry,
  setAnswer,
  setUniform,
  toMapping,
} from './mapping-model';

const NEXT: AutomationFunctionInterface = {
  flavour: 'action',
  inputs: [
    { name: 'lights', type: { t: 'any' }, required: true },
    { name: 'amount', type: { t: 'number' }, required: true },
  ],
  outputs: [{ name: 'level', type: { t: 'text' } }],
  exits: ['done', 'dark'],
};

function change(
  part: AutomationFunctionChange['part'],
  name: string,
  code: string,
  compat: 'compatible' | 'breaking' = 'breaking',
): AutomationFunctionChange {
  return { part, name, code, compat, reason: `${code} ${name}` };
}

const CALLERS: AutomationFunctionUser[] = [
  { kind: 'automation', id: 'a', name: 'Night' },
  { kind: 'automation', id: 'b', name: 'Morning' },
];

const CHANGES = [
  change('input', 'step', 'input-removed'),
  change('input', 'amount', 'input-added-required'),
  change('exit', 'none', 'exit-removed'),
  change('output', 'level', 'output-type-widened'),
  change('output', 'extra', 'output-added', 'compatible'),
];

describe('mapping model', () => {
  const cards = mappingCards(CHANGES, CALLERS, NEXT, 4);

  function at(index: number): MappingEntry {
    const entry = cards[0]?.entries[index];
    if (entry === undefined) throw new Error(`missing entry ${String(index)}`);
    return entry;
  }

  it('makes one card per caller listing only breaking changes in plain words', () => {
    expect(cards.map((card) => card.callerName)).toEqual(['Night', 'Morning']);
    expect(cards[0]?.versionLabel).toBe('Now on version 4');
    expect(cards[0]?.entries.map((entry) => entry.sentence)).toEqual([
      'Input step was removed',
      'Input amount is new and needs a value',
      'Exit none was removed',
      'Output level is now text',
    ]);
  });

  it('offers pickers per kind of change', () => {
    const pickers = (cards[0]?.entries ?? []).map((entry) => entry.picker);
    expect(pickers[0]?.options.map((option) => option.label)).toEqual([
      'Nothing, drop it',
      'lights',
      'amount',
    ]);
    expect(pickers[1]?.kind).toBe('value');
    expect(pickers[2]?.options.map((option) => option.value)).toEqual(['done', 'dark']);
    expect(pickers[3]).toBeNull();
  });

  it('asks for a value when an input becomes required', () => {
    const made = mappingCards([change('input', 'limit', 'input-made-required')], CALLERS, NEXT, 4);
    expect(made[0]?.entries[0]?.picker?.kind).toBe('value');
  });

  it('builds one mapping from the shared answers', () => {
    let state = INITIAL_STATE;
    state = setAnswer(state, 'a', at(0), 'lights');
    state = setAnswer(state, 'a', at(1), '40');
    const result = toMapping(state, cards, NEXT);
    expect(result).toEqual({
      ok: true,
      mapping: {
        inputs: { step: 'lights' },
        inputValues: { amount: { lit: 40 } },
        exits: { none: 'done' },
      },
    });
  });

  it('asks for a value when a new required input has none', () => {
    const result = toMapping(INITIAL_STATE, cards, NEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toContain('Input amount is new');
  });

  it('refuses different answers per caller because one mapping serves all', () => {
    let state = setUniform(INITIAL_STATE, false, cards);
    state = setAnswer(state, 'a', at(0), 'lights');
    state = setAnswer(state, 'a', at(1), '40');
    state = setAnswer(state, 'b', at(1), '40');
    const result = toMapping(state, cards, NEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toContain('different answers');
  });

  it('copies answers between modes', () => {
    const shared = setAnswer(INITIAL_STATE, 'a', at(0), 'amount');
    const split = setUniform(shared, false, cards);
    expect(split.answers['b']?.['input:step']).toBe('amount');
    const back = setUniform(split, true, cards);
    expect(back.answers['*']?.['input:step']).toBe('amount');
  });
});
