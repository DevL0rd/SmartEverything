import { describe, expect, it } from 'vitest';
import {
  NODE_CATEGORIES,
  NODE_CATEGORY_IDS,
  buildRegistry,
  nodeCatalogue,
  categoryName,
  categoryOrder,
  defineNodeKind,
  kindProblems,
  portValueText,
  registryProblems,
  renderSummary,
  summaryPlaceholders,
  summaryProblems,
  summaryText,
  type NodeKind,
} from '../../src/automation-nodes';

const SET_LIGHT: NodeKind = defineNodeKind({
  id: 'device.set_level',
  name: 'Set level',
  category: 'devices',
  icon: 'sun',
  class: 'effect',
  description: 'Sets a light to a brightness.',
  inputs: [
    {
      name: 'target',
      type: { t: 'ref', of: 'device' },
      required: true,
      description: 'Which light.',
    },
    {
      name: 'level',
      type: { t: 'number', integer: true },
      required: false,
      default: 100,
      static: true,
      description: 'Brightness.',
    },
  ],
  outputs: [
    { name: 'ok', type: { t: 'boolean' }, description: 'Whether it worked.' },
    { name: 'error', type: { t: 'error' }, optional: true, description: 'Why not.' },
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command' },
  summary: 'Set {target} to {level}',
  keywords: ['light', 'dim'],
  reads: (ports) => (ports['target'] === undefined ? [] : ['device:control']),
  access: 'member',
  tier: 'v1',
});

const ASK: NodeKind = defineNodeKind({
  id: 'ai.ask',
  name: 'Ask AI',
  category: 'ai',
  icon: 'sparkles',
  class: 'control',
  description: 'Asks the assistant.',
  inputs: [
    {
      name: 'prompt',
      type: { t: 'text' },
      required: true,
      live: true,
      description: 'What to ask.',
      summary: true,
    },
  ],
  outputs: [],
  exits: ['next', 'timedOut'],
  scopes: { required: ['body'], optional: ['else'] },
  stateful: true,
  summary: 'Ask: {prompt}',
  keywords: ['assistant'],
  access: 'owner',
  tier: 'later',
});

const START: NodeKind = defineNodeKind({
  id: 'trigger.time',
  name: 'Time of day',
  category: 'triggers',
  icon: 'clock',
  class: 'trigger',
  description: 'Starts at a time.',
  inputs: [],
  outputs: [{ name: 'at', type: { t: 'instant' }, description: 'When.' }],
  exits: [],
  summary: 'At a set time',
  keywords: [],
  access: 'member',
  tier: 'v1',
});

function variant(change: object): NodeKind {
  return Object.assign({}, SET_LIGHT, change);
}

describe('categories', () => {
  it('lists the palette order', () => {
    expect(NODE_CATEGORIES).toHaveLength(22);
    expect(NODE_CATEGORY_IDS[0]).toBe('triggers');
    expect(categoryOrder('utilities')).toBe(21);
    expect(categoryName('state')).toBe('State and timing');
  });
});

describe('summary templates', () => {
  it('finds placeholders', () => {
    expect(summaryPlaceholders('Turn {target} to {to}.')).toEqual(['target', 'to']);
    expect(summaryPlaceholders('plain')).toEqual([]);
  });

  it('accepts a template whose placeholders are input ports', () => {
    expect(summaryProblems('Turn {target}', ['target'])).toEqual([]);
  });

  it('reports empty, unknown, malformed and stray braces', () => {
    expect(summaryProblems(' ', [])).toEqual(['the summary template is empty']);
    expect(summaryProblems('{nope}', ['a'])).toEqual(['placeholder {nope} names no input port']);
    expect(summaryProblems('{Bad}', ['a'])).toEqual(['"{Bad}" is not a port placeholder']);
    expect(summaryProblems('{}', [])).toEqual(['"{}" is not a port placeholder']);
    expect(summaryProblems('a } b', [])).toEqual(['stray brace in "a } b"']);
  });

  it('renders literals, wires and absent ports as chips', () => {
    const parts = renderSummary('Set {a} to {b}, {c}{d}', {
      a: { lit: 'Kitchen lamp' },
      b: { wire: { from: 'trigger', port: 'level' } },
      c: { lit: 'Hi' },
    });
    expect(parts).toEqual([
      { kind: 'text', text: 'Set ' },
      { kind: 'chip', port: 'a', text: 'Kitchen lamp' },
      { kind: 'text', text: ' to ' },
      { kind: 'chip', port: 'b', text: 'trigger.level' },
      { kind: 'text', text: ', ' },
      { kind: 'chip', port: 'c', text: 'Hi' },
      { kind: 'chip', port: 'd', text: '…' },
    ]);
    expect(summaryText(parts)).toBe('Set Kitchen lamp to trigger.level, Hi…');
  });

  it('writes other literals and shortens long text', () => {
    expect(portValueText({ lit: 5 })).toBe('5');
    expect(portValueText({ lit: null })).toBe('nothing');
    expect(portValueText({ lit: [1, 2] })).toBe('[1,2]');
    expect(portValueText({ lit: '   ' })).toBe('…');
    expect(portValueText({ lit: 'x'.repeat(100) })).toHaveLength(40);
    expect(portValueText({ lit: 'x'.repeat(100) }).endsWith('…')).toBe(true);
    expect(portValueText({ lit: 'a\n b' })).toBe('a b');
  });
});

describe('kind checks', () => {
  it('accepts the fixtures', () => {
    for (const kind of [SET_LIGHT, ASK, START]) expect(kindProblems(kind)).toEqual([]);
  });

  it('rejects broken identity fields', () => {
    expect(kindProblems(variant({ id: 'Bad' }))).toContain('the id is not dotted lowercase words');
    expect(kindProblems(variant({ name: ' ' }))).toContain('the name is empty');
    expect(kindProblems(variant({ icon: '' }))).toContain('the icon is empty');
    expect(kindProblems(variant({ description: '' }))).toContain('the description is empty');
    expect(kindProblems(variant({ category: 'x' }))).toContain('unknown category "x"');
    expect(kindProblems(variant({ keywords: [' '] }))).toContain('a keyword is empty');
  });

  it('rejects port names that are not identifiers', () => {
    const bad = variant({
      inputs: [{ name: 'Bad', type: { t: 'text' }, required: true, description: 'x' }],
      outputs: [{ name: 'run', type: { t: 'text' }, description: 'x' }],
      summary: 'x',
    });
    const problems = kindProblems(bad);
    expect(problems).toContain('port name "Bad" is not a valid identifier');
    expect(problems).toContain('port name "run" is not a valid identifier');
  });

  it('rejects empty descriptions and repeated or conflicting ports', () => {
    const port = { name: 'a', type: { t: 'text' }, required: true, description: 'x' };
    const problems = kindProblems(
      variant({
        inputs: [
          { ...port, description: ' ' },
          { ...port, default: 'v', static: true, live: true },
        ],
        outputs: [
          { name: 'o', type: { t: 'text' }, description: 'x' },
          { name: 'o', type: { t: 'text' }, description: 'x' },
        ],
        summary: '{a}',
      }),
    );
    expect(problems).toContain('port "a" has no description');
    expect(problems).toContain('input port "a" is declared twice');
    expect(problems).toContain('output port "o" is declared twice');
    expect(problems).toContain('input "a" is required and also has a default');
    expect(problems).toContain('input "a" cannot be both static and live');
  });

  it('rejects bad exits and scopes', () => {
    const problems = kindProblems(
      variant({
        exits: ['Bad', 'next', 'next'],
        scopes: { required: ['body', 'Bad'], optional: ['body'] },
      }),
    );
    expect(problems).toContain('exit "Bad" is not an identifier');
    expect(problems).toContain('exit "next" is listed twice');
    expect(problems).toContain('scope "Bad" is not an identifier');
    expect(problems).toContain('scope "body" is listed twice');
  });

  it('keeps quiet classes free of exits and scopes', () => {
    const scoped = { required: [], optional: ['x'] };
    expect(kindProblems({ ...START, exits: ['next'] })).toContain(
      'a trigger kind has no exec exits',
    );
    expect(kindProblems({ ...START, scopes: scoped })).toContain(
      'a trigger kind has no child scopes',
    );
    expect(kindProblems({ ...START, id: 'logic.not', class: 'pure', exits: ['next'] })).toContain(
      'a pure kind has no exec exits',
    );
    expect(kindProblems({ ...START, id: 'logic.not', class: 'read', scopes: scoped })).toContain(
      'a read kind has no child scopes',
    );
  });

  it('ties the trigger prefix, effect class and stateful flag to the class', () => {
    expect(kindProblems({ ...START, id: 'flow.time' })).toContain(
      'only trigger kinds use the trigger. prefix',
    );
    expect(kindProblems({ ...SET_LIGHT, id: 'trigger.set' })).toContain(
      'only trigger kinds use the trigger. prefix',
    );
    const { effect: _effect, ...bare } = SET_LIGHT;
    expect(kindProblems(bare)).toContain(
      'an effect kind declares its retry class and budget class',
    );
    expect(kindProblems({ ...ASK, effect: SET_LIGHT.effect! })).toContain(
      'a control kind has no effect class',
    );
    expect(kindProblems({ ...START, stateful: true })).toContain(
      'a trigger kind cannot be stateful',
    );
    expect(kindProblems({ ...SET_LIGHT, stateful: true })).toEqual([]);
  });

  it('checks the summary against the input ports', () => {
    expect(kindProblems(variant({ summary: 'Set {missing}' }))).toContain(
      'placeholder {missing} names no input port',
    );
  });
});

describe('registry', () => {
  it('reports duplicate ids once and per-kind problems', () => {
    const problems = registryProblems([SET_LIGHT, SET_LIGHT, SET_LIGHT, variant({ name: '' })]);
    expect(problems.filter((p) => p.message.includes('more than one'))).toHaveLength(1);
    expect(problems.some((p) => p.message === 'the name is empty')).toBe(true);
  });

  it('refuses to build a registry with problems', () => {
    expect(() => buildRegistry([SET_LIGHT, SET_LIGHT])).toThrow(
      'invalid node registry: device.set_level: the id is used by more than one kind',
    );
  });

  it('looks kinds up and keeps only shipped tiers', () => {
    const registry = buildRegistry([SET_LIGHT, ASK, START]);
    expect(registry.kinds).toHaveLength(3);
    expect(registry.get('ai.ask')).toBe(ASK);
    expect(registry.get('none.here')).toBeUndefined();
    expect(registry.has('trigger.time')).toBe(true);
    expect(registry.has('none.here')).toBe(false);
    expect(registry.shipped().map((kind) => kind.id)).toEqual(['device.set_level', 'trigger.time']);
  });

  it('builds an empty registry', () => {
    const registry = buildRegistry([]);
    expect(registry.shipped()).toEqual([]);
    expect(nodeCatalogue(registry)).toEqual([]);
  });
});

describe('nodeCatalogue', () => {
  const registry = buildRegistry([SET_LIGHT, ASK, START]);

  it('lists shipped kinds in palette order', () => {
    expect(nodeCatalogue(registry).map((entry) => entry.id)).toEqual([
      'trigger.time',
      'device.set_level',
    ]);
  });

  it('orders kinds of one category by id', () => {
    const other = variant({ id: 'device.alpha' });
    const both = buildRegistry([SET_LIGHT, other]);
    expect(nodeCatalogue(both).map((entry) => entry.id)).toEqual([
      'device.alpha',
      'device.set_level',
    ]);
  });

  it('projects ports as plain text types', () => {
    const entry = nodeCatalogue(registry, { kind: 'device.set_level' })[0];
    expect(entry).toMatchObject({
      group: 'devices',
      groupName: 'Devices',
      meaning: 'Sets a light to a brightness.',
      scopes: [],
      exits: ['next'],
      effect: { retry: 'idempotent', budget: 'command' },
      available: true,
    });
    expect(entry?.inputs[1]).toMatchObject({ name: 'level', default: 100, static: true });
    expect(entry?.inputs[0]).toMatchObject({ name: 'target', required: true });
    expect(entry?.outputs[1]).toMatchObject({ name: 'error', optional: true });
    expect(entry?.inputs[0]?.type).toBe('Device');
  });

  it('filters by group and kind', () => {
    expect(nodeCatalogue(registry, { group: 'devices' })).toHaveLength(1);
    expect(nodeCatalogue(registry, { group: 'flow' })).toEqual([]);
    expect(nodeCatalogue(registry, { kind: 'nope.none' })).toEqual([]);
  });

  it('filters by every query word over names, keywords and summaries', () => {
    expect(nodeCatalogue(registry, { query: 'DIM' })).toHaveLength(1);
    expect(nodeCatalogue(registry, { query: 'light brightness' })).toHaveLength(1);
    expect(nodeCatalogue(registry, { query: 'light zebra' })).toEqual([]);
    expect(nodeCatalogue(registry, { query: '  ' })).toHaveLength(2);
    expect(nodeCatalogue(registry, { query: 'devices' })).toHaveLength(1);
  });

  it('shows unshipped kinds on request and marks owner kinds', () => {
    const all = nodeCatalogue(registry, { includeUnshipped: true });
    expect(all).toHaveLength(3);
    const ask = all.find((entry) => entry.id === 'ai.ask');
    expect(ask).toMatchObject({ available: false, scopes: ['body', 'else'], tier: 'later' });
    expect(ask).not.toHaveProperty('effect');
    const owner = nodeCatalogue(registry, { includeUnshipped: true, caller: 'owner' });
    expect(owner.find((entry) => entry.id === 'ai.ask')?.available).toBe(true);
  });

  it('runs the dependency extractor', () => {
    expect(SET_LIGHT.reads?.({ target: { lit: 'x' } })).toEqual(['device:control']);
    expect(SET_LIGHT.reads?.({})).toEqual([]);
  });
});
