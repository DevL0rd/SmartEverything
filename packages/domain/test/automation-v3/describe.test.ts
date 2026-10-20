import { describe, expect, it } from 'vitest';
import {
  automationSentence,
  wireScopeOf,
  nodeSummaryText,
  programNodes,
} from '../../src/automation-v3/describe';
import { lowerFirst, nodeLabel, upperFirst } from '../../src/automation-v3/describe-context';
import {
  clipText,
  durationText,
  literalText,
  portText,
} from '../../src/automation-v3/describe-values';
import { plainStep } from '../../src/automation-v3/describe-wire';
import type { FlowType } from '../../src/automation-v3/types';
import type { AutomationV3 } from '../../src/automation-v3/program';
import { CTX, ids, node, pressTrigger, program } from './describe-fixture';

const step = plainStep('Step');
const scope = {
  step: (): undefined => undefined,
  variable: (): undefined => undefined,
  input: (): undefined => undefined,
  trigger: step,
};
const names = CTX.names;

describe('labels', () => {
  it('prefers the label, then the registry name, then the kind id', () => {
    expect(nodeLabel({ kind: 'device.set', label: 'Dim' }, CTX.kinds)).toBe('Dim');
    expect(nodeLabel({ kind: 'device.set' }, CTX.kinds)).toBe('Change device');
    expect(nodeLabel({ kind: 'plugin.mystery' }, CTX.kinds)).toBe('Mystery');
    expect(lowerFirst('Abc')).toBe('abc');
    expect(upperFirst('abc')).toBe('Abc');
  });
});

describe('literal text', () => {
  const ref = (of: 'device' | 'room' | 'group' | 'secret') => ({ t: 'ref', of }) as const;

  it('names references and falls back for removed ones', () => {
    expect(literalText(ref('device'), ids.lamp, names)).toBe('Desk lamp');
    expect(literalText(ref('device'), ids.other, names)).toBe('a removed device');
    expect(literalText(ref('device'), 5, names)).toBe('5');
    expect(literalText({ t: 'optional', of: ref('room') }, ids.kitchen, names)).toBe('Kitchen');
    expect(literalText({ t: 'list', of: ref('device') }, [ids.lamp, ids.switchDevice], names)).toBe(
      'Desk lamp, Kitchen switch',
    );
    expect(literalText({ t: 'list', of: ref('device') }, 'x', names)).toBe('x');
  });

  it('writes targets in words', () => {
    const target = { t: 'ref', of: 'target' } as const;
    expect(literalText(target, { device: ids.lamp }, names)).toBe('Desk lamp');
    expect(literalText(target, { devices: [ids.lamp, ids.switchDevice] }, names)).toBe(
      'Desk lamp and Kitchen switch',
    );
    expect(literalText(target, { room: ids.kitchen, families: ['light'] }, names)).toBe(
      'light in Kitchen',
    );
    expect(literalText(target, { room: ids.kitchen }, names)).toBe('Kitchen');
    expect(literalText(target, { group: ids.group }, names)).toBe('Downstairs');
    expect(literalText(target, { families: ['light', 'plug'] }, names)).toBe('light, plug');
    expect(literalText(target, {}, names)).toBe('a target');
    expect(literalText(target, 'nope', names)).toBe('a target');
  });

  it('shows a secret by its name and never by a value', () => {
    const auth = {
      t: 'record',
      fields: { secret: ref('secret'), scheme: { t: 'text' } },
    } as const;
    expect(literalText(auth, { secret: ids.secret, scheme: 'bearer' }, names)).toBe(
      'Weather key, bearer',
    );
    expect(literalText(auth, { secret: ids.other }, names)).toBe('a removed secret');
    expect(literalText({ t: 'record', values: { t: 'number' } }, { a: 1 }, names)).toBe('1');
    expect(literalText({ t: 'record', fields: {} }, { a: 1 }, names)).toBe('1');
    expect(literalText({ t: 'record', fields: {} }, 5, names)).toBe('5');
  });

  it('writes choices, durations, booleans and plain values', () => {
    const choice: FlowType = { t: 'choice', options: [{ id: 'a', label: 'Option A' }] };
    expect(literalText(choice, 'a', names)).toBe('Option A');
    expect(literalText(choice, 'z', names)).toBe('z');
    expect(literalText({ t: 'duration' }, 90_000, names)).toBe('1 min 30 s');
    expect(literalText({ t: 'duration' }, 'soon', names)).toBe('soon');
    expect(literalText({ t: 'boolean' }, true, names)).toBe('yes');
    expect(literalText({ t: 'boolean' }, false, names)).toBe('no');
    expect(literalText(undefined, null, names)).toBe('nothing');
    expect(literalText(undefined, 'text', names)).toBe('text');
    expect(literalText(undefined, [1, 2], names)).toBe('1, 2');
  });

  it('formats durations', () => {
    expect(durationText(5000)).toBe('5 s');
    expect(durationText(120_000)).toBe('2 min');
    expect(durationText(150_000)).toBe('2 min 30 s');
    expect(durationText(3_600_000)).toBe('1 h');
    expect(durationText(5_400_000)).toBe('1 h 30 min');
  });

  it('clips chips', () => {
    expect(clipText('  a   b ')).toBe('a b');
    expect(clipText('')).toBe('…');
    expect(clipText('x'.repeat(60))).toBe(`${'x'.repeat(39)}…`);
  });

  it('writes port values of every form', () => {
    const decl = { type: { t: 'text' } } as const;
    expect(portText(undefined, decl, names, scope)).toBe('…');
    expect(portText({ lit: 'hi' }, undefined, names, scope)).toBe('hi');
    expect(portText({ wire: { from: 'run', port: 'id' } }, decl, names, scope)).toBe(
      'This run › Id',
    );
  });
});

describe('summaries and the sentence', () => {
  it('fills the registry template with named chips', () => {
    const scoped = wireScopeOf(program, CTX);
    expect(nodeSummaryText(pressTrigger, CTX, scoped)).toBe(
      'When Kitchen switch gets a Single press',
    );
    expect(nodeSummaryText(node(1, 'x', 'plugin.mystery'), CTX, scoped)).toBe('Mystery');
    expect(nodeSummaryText(node(2, 'y', 'var.get'), CTX, scoped)).toBe('Get …');
  });

  it('writes a strict compare like any other compare', () => {
    const scoped = wireScopeOf(program, CTX);
    const ports = { a: { lit: 'bright' }, b: { lit: 'dark' }, strict: { lit: true } };
    const strict = { ...node(3, 'z', 'logic.compare'), ports };
    expect(nodeSummaryText(strict, CTX, scoped)).toBe('bright is equal to dark');
  });

  it('builds the scope with labels, variables, inputs and the trigger', () => {
    const withInput: AutomationV3 = {
      ...program,
      inputs: [
        { name: 'level', label: 'Target', type: { t: 'number' }, required: false },
        { name: 'plain', type: { t: 'number' }, required: false },
      ],
    };
    const scoped = wireScopeOf(withInput, CTX);
    expect(scoped.step('cycle')?.label).toBe('Cycle level');
    expect(scoped.step('nothing')).toBeUndefined();
    expect(scoped.variable('level')).toBe('Level');
    expect(scoped.variable('x')).toBeUndefined();
    expect(scoped.input('level')).toBe('Target');
    expect(scoped.input('plain')).toBe('Plain');
    expect(scoped.input('x')).toBeUndefined();
    expect(scoped.trigger.label).toBe('Button pressed');
    const many = wireScopeOf({ ...program, triggers: [pressTrigger, pressTrigger] }, CTX);
    expect(many.trigger.label).toBe('Trigger');
    const none = wireScopeOf({ ...program, triggers: [] }, CTX);
    expect(none.trigger.label).toBe('Trigger');
  });

  it('describes a function program with a plain trigger label', () => {
    const fn = wireScopeOf(
      {
        version: 3,
        kind: 'function',
        flavour: 'pure',
        inputs: [],
        outputs: [],
        exits: ['done'],
        variables: [],
        body: { nodes: [] },
      },
      CTX,
    );
    expect(fn.trigger.label).toBe('Trigger');
  });

  it('lists the nodes of the body and the failure scope', () => {
    const failing: AutomationV3 = {
      ...program,
      onFailure: { nodes: [node(5, 'warn', 'device.set')] },
    };
    expect(programNodes(failing).map((entry) => entry.key)).toEqual(['cycle', 'setLights', 'warn']);
    expect(programNodes(program).map((entry) => entry.key)).toEqual(['cycle', 'setLights']);
  });

  it('writes the automation sentence', () => {
    expect(automationSentence(program, CTX)).toBe(
      'When Kitchen switch gets a Single press, next level, then set brightness of light in Kitchen to Cycle level › Value.',
    );
  });

  it('adds the admit condition, skips disabled parts and returns null without a trigger or step', () => {
    const guarded: AutomationV3 = { ...program, admit: { wire: { from: 'vars', port: 'level' } } };
    expect(automationSentence(guarded, CTX)).toContain(', if Level (variable), ');
    const literal: AutomationV3 = { ...program, admit: { lit: true } };
    expect(automationSentence(literal, CTX)).not.toContain(' if ');
    const off: AutomationV3 = {
      ...program,
      triggers: [{ ...pressTrigger, enabled: false }],
    };
    expect(automationSentence(off, CTX)).toBeNull();
    const quiet: AutomationV3 = {
      ...program,
      body: {
        nodes: [
          node(7, 'a', 'var.get'),
          node(8, 'b', 'plugin.mystery'),
          node(9, 'c', 'device.set', { enabled: false }),
        ],
      },
    };
    expect(automationSentence(quiet, CTX)).toBeNull();
  });

  it('joins several triggers with or', () => {
    const two: AutomationV3 = {
      ...program,
      triggers: [pressTrigger, { ...pressTrigger, id: ids.node, key: 'second' }],
    };
    expect(automationSentence(two, CTX)).toMatch(/^When .* or when .*, /);
  });
});
