import { describe, expect, it } from 'vitest';
import type { FlowType, JsonValue } from '@smarteverything/domain';
import { literalFits, literalRefs, literalType } from '../../src/check/literals';
import { programRoots } from '../../src/check/roots';
import { conversionFix, mapValues, optionalIf, own } from '../../src/check/scope-types';
import { entriesOf, shapeOf } from '../../src/check/shapes';
import type { ResolvedTyping } from '../../src/check/types';
import { resolveTypes, typeOfValue, typingAccepts } from '../../src/check/types';
import { indexProgram } from '../../src/program/lookup';
import type { Program } from '../../src/program/walk';
import {
  automation,
  context,
  wired,
  functionProgram,
  lit,
  node,
  scope,
  trigger,
  uuid,
} from './c23-support';

const text: FlowType = { t: 'text' };
const number: FlowType = { t: 'number' };
const whole: FlowType = { t: 'number', integer: true };
const any: FlowType = { t: 'any' };

function typesOf(program: Program): ReturnType<typeof resolveTypes> {
  return resolveTypes(indexProgram(program), context());
}

function portType(program: Program, key: string, port: string): FlowType | undefined {
  return typesOf(program).typed.outputs.get(key)?.[port];
}

describe('scope helpers', () => {
  it('reads only own properties', () => {
    expect(own({ a: 1 }, 'a')).toBe(1);
    expect(own({ a: 1 }, 'constructor')).toBeUndefined();
    expect(own(undefined, 'a')).toBeUndefined();
  });

  it('maps values and wraps in optional once', () => {
    expect(mapValues({ a: 1, b: 2 }, (value) => value * 2)).toEqual({ a: 2, b: 4 });
    expect(optionalIf(true, text)).toEqual({ t: 'optional', of: text });
    expect(optionalIf(true, { t: 'optional', of: text })).toEqual({ t: 'optional', of: text });
    expect(optionalIf(false, text)).toBe(text);
  });

  it('offers a conversion label only when one applies', () => {
    expect(conversionFix(text, number)).toBe('Wire it through a Convert node set to Number');
    expect(conversionFix({ t: 'boolean' }, number)).toBeUndefined();
  });
});

describe('literalFits', () => {
  const choice: FlowType = { t: 'choice', options: [{ id: 'a', label: 'A' }] };
  const fits = (type: FlowType, value: JsonValue): boolean => literalFits(type, value);

  it('checks scalars', () => {
    expect(fits({ t: 'boolean' }, true)).toBe(true);
    expect(fits({ t: 'boolean' }, 1)).toBe(false);
    expect(fits(text, 'x')).toBe(true);
    expect(fits(text, 1)).toBe(false);
    expect(fits({ t: 'duration' }, 100)).toBe(true);
    expect(fits({ t: 'duration' }, -1)).toBe(false);
    expect(fits({ t: 'duration' }, '1s')).toBe(false);
    expect(fits(any, null)).toBe(true);
    expect(fits({ t: 'param', name: 'T' }, 1)).toBe(true);
  });

  it('checks times and dates', () => {
    expect(fits({ t: 'instant' }, '2026-10-18T10:00:00+07:00')).toBe(true);
    expect(fits({ t: 'instant' }, '2026-10-18T10:00Z')).toBe(true);
    expect(fits({ t: 'instant' }, '2026-10-18 10:00')).toBe(false);
    expect(fits({ t: 'instant' }, '2026-13-45T10:00:00Z')).toBe(false);
    expect(fits({ t: 'instant' }, 5)).toBe(false);
    expect(fits({ t: 'timeOfDay' }, '07:30')).toBe(true);
    expect(fits({ t: 'timeOfDay' }, '25:00')).toBe(false);
    expect(fits({ t: 'timeOfDay' }, 730)).toBe(false);
    expect(fits({ t: 'date' }, '2026-02-28')).toBe(true);
    expect(fits({ t: 'date' }, '2026-02-30')).toBe(false);
    expect(fits({ t: 'date' }, '28/02/2026')).toBe(false);
    expect(fits({ t: 'date' }, 20260228)).toBe(false);
  });

  it('checks numbers, choices, colors and errors', () => {
    const bounded: FlowType = { t: 'number', integer: true, min: 1, max: 5 };
    expect(fits(bounded, 3)).toBe(true);
    expect(fits(bounded, 3.5)).toBe(false);
    expect(fits(bounded, 0)).toBe(false);
    expect(fits(bounded, 6)).toBe(false);
    expect(fits(bounded, '3')).toBe(false);
    expect(fits(number, 2.5)).toBe(true);
    expect(fits(choice, 'a')).toBe(true);
    expect(fits(choice, 'b')).toBe(false);
    expect(fits({ t: 'color' }, { hue: 1 })).toBe(true);
    expect(fits({ t: 'color' }, 'red')).toBe(false);
    expect(fits({ t: 'color' }, [1])).toBe(false);
    expect(fits({ t: 'error' }, { class: 'Failed', message: 'x' })).toBe(true);
    expect(fits({ t: 'error' }, 'x')).toBe(false);
  });

  it('checks lists, optionals and records', () => {
    expect(fits({ t: 'list', of: number }, [1, 2])).toBe(true);
    expect(fits({ t: 'list', of: number }, [1, 'x'])).toBe(false);
    expect(fits({ t: 'list', of: number }, 1)).toBe(false);
    expect(fits({ t: 'optional', of: number }, 1)).toBe(true);
    expect(fits({ t: 'optional', of: number }, 'x')).toBe(false);
    const shaped: FlowType = {
      t: 'record',
      fields: { a: text, b: { t: 'optional', of: number } },
    };
    expect(fits(shaped, { a: 'x' })).toBe(true);
    expect(fits(shaped, { a: 'x', b: 1 })).toBe(true);
    expect(fits(shaped, { b: 1 })).toBe(false);
    expect(fits(shaped, { a: 'x', c: 1 })).toBe(false);
    expect(fits(shaped, { a: 1 })).toBe(false);
    expect(fits(shaped, 'x')).toBe(false);
    const open: FlowType = { t: 'record', values: number };
    expect(fits(open, { a: 1, b: 2 })).toBe(true);
    expect(fits(open, { a: 'x' })).toBe(false);
    const mixed: FlowType = { t: 'record', fields: { a: text }, values: number };
    expect(fits(mixed, { a: 'x', b: 2 })).toBe(true);
    expect(fits({ t: 'record' }, { anything: [1] })).toBe(true);
  });

  it('checks references and targets', () => {
    expect(fits({ t: 'ref', of: 'room' }, 'room-1')).toBe(true);
    expect(fits({ t: 'ref', of: 'room' }, '')).toBe(false);
    expect(fits({ t: 'ref', of: 'room' }, { room: 'x' })).toBe(false);
    const target: FlowType = { t: 'ref', of: 'target' };
    expect(fits(target, { device: 'd1' })).toBe(true);
    expect(fits(target, { devices: ['d1', 'd2'] })).toBe(true);
    expect(fits(target, { room: 'r1', families: ['light'] })).toBe(true);
    expect(fits(target, { group: 'g1' })).toBe(true);
    expect(fits(target, {})).toBe(false);
    expect(fits(target, { wall: 'x' })).toBe(false);
    expect(fits(target, { devices: 'd1' })).toBe(false);
    expect(fits(target, { device: ['d1'] })).toBe(false);
    expect(fits(target, 'd1')).toBe(false);
  });
});

describe('literalRefs', () => {
  it('collects references wherever they sit', () => {
    expect(literalRefs({ t: 'ref', of: 'room' }, 'r1')).toEqual([{ of: 'room', id: 'r1' }]);
    expect(literalRefs({ t: 'ref', of: 'room' }, 4)).toEqual([]);
    expect(literalRefs({ t: 'optional', of: { t: 'ref', of: 'room' } }, 'r1')).toEqual([
      { of: 'room', id: 'r1' },
    ]);
    expect(literalRefs({ t: 'list', of: { t: 'ref', of: 'room' } }, ['a', 'b'])).toEqual([
      { of: 'room', id: 'a' },
      { of: 'room', id: 'b' },
    ]);
    expect(literalRefs({ t: 'list', of: { t: 'ref', of: 'room' } }, 'a')).toEqual([]);
    const record: FlowType = {
      t: 'record',
      fields: { secret: { t: 'ref', of: 'secret' } },
      values: { t: 'ref', of: 'device' },
    };
    expect(literalRefs(record, { secret: 's1', other: 'd1' })).toEqual([
      { of: 'secret', id: 's1' },
      { of: 'device', id: 'd1' },
    ]);
    expect(literalRefs({ t: 'record', fields: { a: text } }, { a: 'x', b: 'y' })).toEqual([]);
    expect(literalRefs(record, 'x')).toEqual([]);
    expect(literalRefs(text, 'x')).toEqual([]);
  });

  it('reads the ids of a target', () => {
    const target: FlowType = { t: 'ref', of: 'target' };
    expect(
      literalRefs(target, { device: 'd1', devices: ['d2', 'd3'], room: 'r1', families: ['x'] }),
    ).toEqual([
      { of: 'target', id: 'd1' },
      { of: 'target', id: 'd2' },
      { of: 'target', id: 'd3' },
      { of: 'target', id: 'r1' },
    ]);
    expect(literalRefs(target, 'd1')).toEqual([]);
  });
});

describe('literalType', () => {
  it('infers a type from a value', () => {
    expect(literalType(true)).toEqual({ t: 'boolean' });
    expect(literalType(1)).toEqual(number);
    expect(literalType('x')).toEqual(text);
    expect(literalType(null)).toEqual({ t: 'optional', of: any });
    expect(literalType([1, 2])).toEqual({ t: 'list', of: number });
    expect(literalType([1, 'x'])).toEqual({ t: 'list', of: any });
    expect(literalType([])).toEqual({ t: 'list', of: any });
    expect(literalType({ a: 1 })).toEqual({ t: 'record', fields: { a: number } });
  });
});

describe('entries and shapes', () => {
  it('lists triggers before nodes', () => {
    const program = automation([node('a', 'notify.feed')], {
      triggers: [trigger('t', 'trigger.time')],
    });
    expect(entriesOf(indexProgram(program)).map((entry) => entry.node.key)).toEqual(['t', 'a']);
    expect(entriesOf(indexProgram(functionProgram([node('a', 'notify.feed')]))).length).toBe(1);
  });

  it('reads the shape of a kind and of the dynamic kinds', () => {
    const ctx = context({
      functions: {
        f1: {
          inputs: [
            { name: 'room', type: { t: 'ref', of: 'room' }, required: true },
            { name: 'level', type: number, required: true, default: 5, description: 'Level' },
          ],
          outputs: [
            { name: 'done', type: text },
            { name: 'extra', type: number, optional: true, description: 'More' },
          ],
          exits: ['done'],
        },
      },
    });
    const program = automation(
      [
        node('plain', 'notify.feed'),
        node('call', 'fn.call', { fn: lit('f1') }),
        node('lost', 'fn.call', { fn: lit('nope') }),
        node('ret', 'flow.return'),
        node('ghost', 'no.such'),
      ],
      {
        triggers: [trigger('start', 'trigger.called')],
        inputs: [{ name: 'room', type: { t: 'ref', of: 'room' }, required: true }],
        outputs: [
          { name: 'a', type: text },
          { name: 'b', type: number, optional: true },
        ],
      },
    );
    const shape = (key: string): ReturnType<typeof shapeOf> => {
      const entry = entriesOf(indexProgram(program)).find((found) => found.node.key === key);
      return entry === undefined ? undefined : shapeOf(entry, program, ctx);
    };
    expect(shape('plain')?.open).toBe(false);
    expect(shape('ghost')).toBeUndefined();
    const call = shape('call');
    expect(call?.inputs.map((port) => [port.name, port.required])).toEqual([
      ['fn', true],
      ['pin', false],
      ['room', true],
      ['level', false],
    ]);
    expect(call?.outputs.map((port) => [port.name, port.optional])).toEqual([
      ['done', undefined],
      ['extra', true],
    ]);
    expect(shape('lost')?.open).toBe(true);
    expect(shape('ret')?.inputs.map((port) => [port.name, port.required])).toEqual([
      ['exit', false],
      ['a', true],
      ['b', false],
    ]);
    expect(shape('start')?.outputs.map((port) => port.name)).toEqual(['room']);
  });
});

describe('roots', () => {
  it('builds the reserved roots of an automation', () => {
    const program = automation([], {
      triggers: [trigger('a', 'trigger.time'), trigger('b', 'trigger.signal')],
      inputs: [
        { name: 'need', type: text, required: true },
        { name: 'maybe', type: text, required: false },
        { name: 'dflt', type: text, required: false, default: 'x' },
      ],
      variables: [{ name: 'count', type: whole, initial: { lit: 0 } }],
    });
    const roots = programRoots(program, [
      { at: { t: 'instant' }, extra: text },
      { at: { t: 'instant' }, extra: number },
    ]);
    expect(Object.keys(roots).sort()).toEqual(['home', 'inputs', 'run', 'trigger', 'vars']);
    expect(roots.inputs).toEqual({
      t: 'record',
      fields: { need: text, maybe: { t: 'optional', of: text }, dflt: text },
    });
    expect(roots.vars).toEqual({ t: 'record', fields: { count: whole } });
    expect(roots.trigger).toEqual({
      t: 'record',
      fields: { at: { t: 'instant' }, key: text },
    });
    expect(programRoots(automation([]), []).trigger).toEqual({
      t: 'record',
      fields: { key: text, at: { t: 'instant' } },
    });
  });

  it('leaves the trigger root out of a function', () => {
    expect(programRoots(functionProgram([]), []).trigger).toBeUndefined();
  });
});

describe('types of values', () => {
  const program = automation([node('step', 'math.add', { a: lit(1), b: lit(2) })], {
    triggers: [trigger('t', 'trigger.time', { at: lit('07:00') })],
    inputs: [
      { name: 'who', type: { t: 'record', fields: { name: text } }, required: true },
      { name: 'bag', type: { t: 'record', values: text }, required: true },
    ],
  });
  const typed = typesOf(program).typed;

  it('types a literal', () => {
    expect(typeOfValue(lit(3), typed)).toEqual({ kind: 'lit', value: 3, type: number });
  });

  it('types a wire from the exact declared type of its source', () => {
    expect(typeOfValue(wired('inputs.who'), typed)).toEqual({
      kind: 'type',
      type: { t: 'record', fields: { name: text } },
    });
    expect(typeOfValue(wired('step.result'), typed)).toEqual({ kind: 'type', type: number });
    expect(typeOfValue(wired('t.at'), typed)).toMatchObject({ kind: 'type' });
    expect(typeOfValue(wired('trigger.key'), typed)).toEqual({ kind: 'type', type: text });
  });

  it('answers opaque for a source or port it does not know', () => {
    const odd = automation([node('ghost', 'no.such'), node('b', 'notify.feed')]);
    const oddTyped = typesOf(odd).typed;
    expect(typeOfValue(wired('ghost.value'), oddTyped)).toEqual({ kind: 'opaque' });
    expect(typeOfValue(wired('step.missing'), typed)).toEqual({ kind: 'opaque' });
    expect(typeOfValue(wired('home.nothing'), typed)).toEqual({ kind: 'opaque' });
  });
});

describe('typingAccepts', () => {
  const wire = (type: FlowType): ResolvedTyping => ({ kind: 'type', type });
  const bounded = (max: number): FlowType => ({ t: 'number', max });

  it('fits literals by value', () => {
    const literal: ResolvedTyping = { kind: 'lit', value: 3, type: number };
    expect(typingAccepts(literal, { t: 'number', integer: true, max: 5 })).toBe(true);
    expect(typingAccepts(literal, { t: 'number', integer: true, max: 2 })).toBe(false);
  });

  it('fits wires by type and ignores number bounds it cannot prove', () => {
    const exact = wire(whole);
    expect(typingAccepts(exact, { t: 'number', integer: true, min: 0, max: 5 })).toBe(true);
    expect(typingAccepts(wire(number), whole)).toBe(true);
    expect(typingAccepts(exact, text)).toBe(false);
    expect(typingAccepts(exact, { t: 'list', of: bounded(3) })).toBe(false);
    expect(typingAccepts(exact, { t: 'optional', of: bounded(3) })).toBe(true);
    expect(typingAccepts(wire({ t: 'list', of: whole }), { t: 'list', of: bounded(3) })).toBe(true);
    const record = wire({ t: 'record', fields: { a: whole }, values: whole });
    expect(typingAccepts(record, { t: 'record', fields: { a: bounded(3) } })).toBe(true);
    expect(typingAccepts(record, { t: 'record', values: bounded(3) })).toBe(true);
    expect(typingAccepts(record, { t: 'boolean' })).toBe(false);
    expect(typingAccepts(wire({ t: 'optional', of: text }), text)).toBe(false);
  });
});

describe('resolveTypes', () => {
  it('resolves generic outputs from the connected values', () => {
    const program = automation([
      node('a', 'math.add', { a: lit(1), b: lit(2) }),
      node('b', 'math.add', { a: wired('a.result'), b: wired('a.result') }),
      node('c', 'math.add', { a: wired('b.result'), b: lit(1) }),
    ]);
    expect(portType(program, 'a', 'result')).toEqual(number);
    expect(portType(program, 'b', 'result')).toEqual(number);
    expect(portType(program, 'c', 'result')).toEqual(number);
  });

  it('leaves an unbound generic as a parameter and wraps optional outputs', () => {
    const program = automation([
      node('each', 'flow.for_each', { items: lit(['a', 'b']) }, { scopes: { body: scope() } }),
    ]);
    expect(portType(program, 'each', 'item')).toEqual(text);
    expect(portType(program, 'each', 'index')).toMatchObject({ t: 'number', integer: true });
    expect(portType(program, 'each', 'results')).toEqual({
      t: 'optional',
      of: { t: 'list', of: { t: 'param', name: 'result' } },
    });
  });

  it('types the error of a try', () => {
    const program = automation([node('guard', 'flow.try', {}, { scopes: { try: scope() } })]);
    expect(portType(program, 'guard', 'error')).toEqual({ t: 'error' });
  });

  it('wraps the outputs of every trigger in optional when there are several', () => {
    const one = automation([], { triggers: [trigger('a', 'trigger.time', { at: lit('07:00') })] });
    expect(portType(one, 'a', 'at')).toEqual({ t: 'instant' });
    const two = automation([], {
      triggers: [
        trigger('a', 'trigger.time', { at: lit('07:00') }),
        trigger('b', 'trigger.time', { at: lit('08:00') }),
      ],
    });
    expect(portType(two, 'a', 'at')).toEqual({ t: 'optional', of: { t: 'instant' } });
    expect(typesOf(two).typed.roots.trigger).toMatchObject({ fields: { at: { t: 'instant' } } });
  });

  it('types the outputs of a called automation from its inputs and of a call from the function', () => {
    const program = automation([node('call', 'fn.call', { fn: lit('f1') })], {
      triggers: [trigger('start', 'trigger.called')],
      inputs: [{ name: 'room', type: text, required: true }],
    });
    const ctx = context({
      functions: {
        f1: { inputs: [], outputs: [{ name: 'done', type: whole, optional: true }], exits: ['d'] },
      },
    });
    const typed = resolveTypes(indexProgram(program), ctx).typed;
    expect(typed.outputs.get('start')).toEqual({ room: text });
    expect(typed.outputs.get('call')).toEqual({ done: { t: 'optional', of: whole } });
  });

  it('skips steps of an unknown kind', () => {
    const typed = typesOf(automation([node('ghost', 'no.such')])).typed;
    expect(typed.outputs.has('ghost')).toBe(false);
  });

  it('reports values that disagree on a shared type', () => {
    const program = automation([
      node('pick', 'logic.select', {
        condition: lit(true),
        whenTrue: lit(1),
        whenFalse: lit('x'),
      }),
    ]);
    const { problems } = typesOf(program);
    expect(problems).toMatchObject([
      {
        key: 'pick',
        port: 'whenFalse',
        code: 'generic_mismatch',
        expected: 'Number',
        received: 'Text',
        fix: 'Wire it through a Convert node set to Number',
      },
    ]);
  });

  it('does not bind from values it cannot type', () => {
    const program = automation([
      node('ghost', 'no.such'),
      node('pick', 'logic.select', {
        condition: lit(true),
        whenTrue: wired('ghost.other'),
        whenFalse: wired('ghost.value'),
      }),
      node('other', 'logic.select', { condition: lit(true) }),
    ]);
    expect(typesOf(program).problems).toEqual([]);
    expect(portType(program, 'pick', 'value')).toEqual({ t: 'param', name: 'item' });
  });
});

describe('structured outputs', () => {
  const first = uuid();
  const second = uuid();

  function branching(
    values: Record<string, ReturnType<typeof lit>>,
    shape: { readonly withElse: boolean; readonly type?: FlowType },
  ): Program {
    return automation([
      node('len', 'list.length', { list: lit([1]) }),
      node(
        'when',
        'flow.if',
        {},
        {
          branches: [
            { id: first, when: lit(true), scope: scope() },
            { id: second, when: lit(false), scope: scope() },
          ],
          ...(shape.withElse ? { scopes: { else: scope() } } : {}),
          outputs: [
            { name: 'level', ...(shape.type === undefined ? {} : { type: shape.type }), values },
          ],
        },
      ),
    ]);
  }

  const both = { [first]: lit(1), [`branch:${second}`]: lit(2) };

  it('types the output as the common type when every path gives a value', () => {
    expect(
      portType(branching({ ...both, else: lit(3) }, { withElse: true }), 'when', 'level'),
    ).toEqual(number);
  });

  it('makes the output optional when a path gives nothing', () => {
    const open = branching({ ...both, else: lit(3) }, { withElse: false });
    expect(portType(open, 'when', 'level')).toEqual({ t: 'optional', of: number });
    const missing = branching({ [first]: lit(1), else: lit(3) }, { withElse: true });
    expect(portType(missing, 'when', 'level')).toEqual({ t: 'optional', of: number });
    const noElse = branching(both, { withElse: false });
    expect(portType(noElse, 'when', 'level')).toEqual({ t: 'optional', of: number });
  });

  it('widens to the type every value fits', () => {
    const program = branching(
      { [first]: wired('len.length'), [second]: lit(2.5), else: wired('len.length') },
      { withElse: true },
    );
    expect(portType(program, 'when', 'level')).toEqual(number);
    expect(typesOf(program).problems).toEqual([]);
  });

  it('reports values that cannot share a type', () => {
    const program = branching(
      { [first]: lit(true), [second]: lit('x'), else: lit(true) },
      { withElse: true },
    );
    expect(typesOf(program).problems).toMatchObject([
      {
        key: 'when',
        port: 'outputs.level',
        code: 'structured_output_mismatch',
        expected: 'On/off',
        received: 'Text',
      },
    ]);
  });

  it('checks every value against a declared type', () => {
    const fine = branching({ ...both, else: lit(3) }, { withElse: true, type: number });
    expect(typesOf(fine).problems).toEqual([]);
    const wrong = branching({ ...both, else: lit('x') }, { withElse: true, type: number });
    expect(typesOf(wrong).problems).toMatchObject([
      {
        code: 'structured_output_mismatch',
        expected: 'Number',
        received: 'Text',
        fix: 'Wire it through a Convert node set to Number',
      },
    ]);
    expect(portType(wrong, 'when', 'level')).toEqual(number);
  });

  it('gives any when no value can be typed', () => {
    const program = branching(
      { [first]: wired('ghost.value'), else: wired('nothing.here') },
      { withElse: true },
    );
    expect(portType(program, 'when', 'level')).toEqual({ t: 'optional', of: any });
  });

  it('counts a try as complete without its finally scope', () => {
    const catching = uuid();
    const program = automation([
      node(
        'guard',
        'flow.try',
        {},
        {
          scopes: { try: scope(), finally: scope() },
          catches: [{ id: catching, scope: scope() }],
          outputs: [{ name: 'done', values: { try: lit(1), [`catch:${catching}`]: lit(2) } }],
        },
      ),
      node(
        'branchy',
        'flow.switch',
        { subject: lit(1) },
        {
          cases: [{ id: second, match: { eq: 1 }, scope: scope() }],
          outputs: [{ name: 'got', values: { [second]: lit(1) } }],
        },
      ),
    ]);
    expect(portType(program, 'guard', 'done')).toEqual(number);
    expect(portType(program, 'branchy', 'got')).toEqual({ t: 'optional', of: number });
  });
});
