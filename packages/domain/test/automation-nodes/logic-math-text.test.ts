import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRegistry,
  kindProblems,
  nodeCatalogue,
  type NodeKind,
} from '../../src/automation-nodes';
import { LOGIC_KINDS } from '../../src/automation-nodes/logic';
import { MATH_KINDS } from '../../src/automation-nodes/math';
import { TEXT_KINDS } from '../../src/automation-nodes/text';
import { FLOW_TYPE } from '../../src/automation-v3/types';

const GROUPS = [
  {
    name: 'logic',
    kinds: LOGIC_KINDS,
    ids: [
      'logic.compare',
      'logic.between',
      'logic.in',
      'logic.and',
      'logic.or',
      'logic.not',
      'logic.exists',
      'logic.coalesce',
      'logic.select',
      'logic.time_window',
      'logic.daylight',
      'logic.trigger_is',
    ],
  },
  {
    name: 'math',
    kinds: MATH_KINDS,
    ids: [
      'math.add',
      'math.subtract',
      'math.multiply',
      'math.divide',
      'math.modulo',
      'math.round',
      'math.min_max',
      'math.clamp',
      'math.check_range',
      'math.map_range',
      'math.stats',
      'math.function',
    ],
  },
  {
    name: 'text',
    kinds: TEXT_KINDS,
    ids: ['text.format', 'text.join', 'text.split', 'text.replace', 'text.regex', 'text.test'],
  },
] as const;

const ALL = GROUPS.flatMap((group) => group.kinds);

const ICON_DIR = join(
  import.meta.dirname,
  '../../../../node_modules/lucide-react-native/dist/esm/icons',
);

describe.each(GROUPS)('$name kinds', ({ kinds, ids, name }) => {
  it('registers exactly the v1 kinds of the catalogue section', () => {
    expect(kinds.map((kind) => kind.id)).toEqual(ids);
    for (const kind of kinds) {
      expect(kind.id.startsWith(`${name}.`)).toBe(true);
      expect(kind.category).toBe(name);
      expect(kind.tier).toBe('v1');
    }
  });

  it('has no registry problems', () => {
    for (const kind of kinds) expect(kindProblems(kind)).toEqual([]);
  });

  it('is a quiet kind without exits or scopes and without effects', () => {
    for (const kind of kinds) {
      expect(kind.exits).toEqual([]);
      expect(kind.scopes).toBeUndefined();
      expect(kind.effect).toBeUndefined();
      expect(['pure', 'read']).toContain(kind.class);
    }
  });

  it('has outputs, keywords and valid port types', () => {
    for (const kind of kinds) {
      expect(kind.outputs.length).toBeGreaterThan(0);
      expect(kind.keywords.length).toBeGreaterThan(0);
      for (const port of [...kind.inputs, ...kind.outputs]) {
        expect(FLOW_TYPE.safeParse(port.type).success).toBe(true);
      }
    }
  });

  it('gives static options a default or marks them required', () => {
    for (const kind of kinds) {
      for (const port of kind.inputs.filter((item) => item.static === true)) {
        expect(port.required || port.default !== undefined || port.type.t !== 'choice').toBe(true);
      }
    }
  });

  it('keeps choice defaults inside their options', () => {
    for (const kind of kinds) {
      for (const port of kind.inputs) {
        if (port.type.t === 'choice' && port.default !== undefined) {
          expect(port.type.options.map((item) => item.id)).toContain(port.default);
        }
      }
    }
  });
});

describe('together', () => {
  it('builds one registry with unique ids', () => {
    const registry = buildRegistry(ALL);
    expect(registry.kinds).toHaveLength(30);
    expect(registry.shipped()).toHaveLength(30);
  });

  it('appears in the catalogue by group and by keyword', () => {
    const registry = buildRegistry(ALL);
    expect(nodeCatalogue(registry, { group: 'math' })).toHaveLength(12);
    expect(nodeCatalogue(registry, { query: 'regular expression' }).map((e) => e.id)).toEqual([
      'text.regex',
    ]);
    expect(
      nodeCatalogue(registry, { kind: 'logic.between' })[0]?.inputs.map((p) => p.name),
    ).toEqual(['value', 'min', 'max', 'inclusive']);
  });

  it('uses icons that exist in lucide-react-native', () => {
    for (const kind of ALL) expect(existsSync(join(ICON_DIR, `${kind.icon}.mjs`))).toBe(true);
  });

  it('never offers the CEL matches operator', () => {
    for (const kind of TEXT_KINDS) {
      const text = [kind.description, kind.summary, ...kind.keywords].join(' ');
      expect(text).not.toMatch(/\bmatches\b/);
    }
  });
});

describe('logic', () => {
  const byId = (id: string): NodeKind => LOGIC_KINDS.find((kind) => kind.id === id)!;

  it('compare takes two generic values and several options', () => {
    const compare = byId('logic.compare');
    expect(compare.inputs.find((port) => port.name === 'a')?.type).toEqual({
      t: 'param',
      name: 'item',
    });
    expect(compare.inputs.filter((port) => port.static === true).map((port) => port.name)).toEqual([
      'op',
      'ignoreCase',
      'tolerance',
      'strict',
    ]);
    const op = compare.inputs.find((port) => port.name === 'op')?.type;
    expect(op?.t === 'choice' && op.options.map((item) => item.id)).toEqual([
      'eq',
      'ne',
      'gt',
      'gte',
      'lt',
      'lte',
    ]);
    expect(compare.outputs[0]?.type).toEqual({ t: 'boolean' });
  });

  it('and and or take two required and two optional wired flags', () => {
    for (const id of ['logic.and', 'logic.or']) {
      const inputs = byId(id).inputs;
      expect(inputs.map((port) => [port.name, port.required])).toEqual([
        ['a', true],
        ['b', true],
        ['c', false],
        ['d', false],
      ]);
      expect(inputs.every((port) => port.type.t === 'boolean')).toBe(true);
    }
  });

  it('coalesce and select return the generic type', () => {
    expect(byId('logic.coalesce').outputs[0]?.type).toEqual({ t: 'param', name: 'item' });
    expect(byId('logic.select').outputs[0]?.type).toEqual({ t: 'param', name: 'item' });
    expect(byId('logic.select').inputs.map((port) => port.name)).toEqual([
      'condition',
      'whenTrue',
      'whenFalse',
    ]);
  });

  it('time_window has an optional instant and required time-of-day limits', () => {
    const window = byId('logic.time_window');
    expect(window.inputs.find((port) => port.name === 'at')?.required).toBe(false);
    for (const name of ['after', 'before']) {
      const port = window.inputs.find((item) => item.name === name);
      expect(port?.type).toEqual({ t: 'timeOfDay' });
      expect(port?.required).toBe(true);
      expect(port?.static).toBe(true);
    }
  });

  it('daylight is a clock read and the rest are pure', () => {
    expect(byId('logic.daylight').class).toBe('read');
    expect(byId('logic.daylight').reads?.({})).toEqual(['clock']);
    expect(LOGIC_KINDS.filter((kind) => kind.class === 'read')).toHaveLength(1);
  });

  it('exists unwraps an optional value', () => {
    expect(byId('logic.exists').inputs[0]?.type).toEqual({
      t: 'optional',
      of: { t: 'any' },
    });
  });
});

describe('math', () => {
  const byId = (id: string): NodeKind => MATH_KINDS.find((kind) => kind.id === id)!;

  it('divide and modulo name the zero case in their description', () => {
    expect(byId('math.divide').description).toContain('MathError');
    expect(byId('math.modulo').description).toContain('MathError');
  });

  it('round limits places to -6..10', () => {
    const places = byId('math.round').inputs.find((port) => port.name === 'places')?.type;
    expect(places).toEqual({ t: 'number', integer: true, min: -6, max: 10 });
  });

  it('clamp gives the number and whether it moved', () => {
    expect(byId('math.clamp').outputs.map((port) => port.name)).toEqual(['result', 'clamped']);
  });

  it('stats marks everything but sum and count optional', () => {
    const optional = byId('math.stats')
      .outputs.filter((port) => port.optional === true)
      .map((port) => port.name);
    expect(optional).toEqual(['average', 'median', 'min', 'max', 'stddev']);
  });

  it('function lists every operation of the catalogue', () => {
    const op = byId('math.function').inputs.find((port) => port.name === 'op')?.type;
    expect(op?.t === 'choice' && op.options.map((item) => item.id)).toEqual([
      'abs',
      'sign',
      'negate',
      'sqrt',
      'power',
      'log10',
      'ln',
      'exp',
      'sin',
      'cos',
      'tan',
      'asin',
      'acos',
      'atan',
      'atan2',
      'degrees',
      'radians',
    ]);
  });

  it('add and multiply take two to four wired arithmetic values', () => {
    for (const id of ['math.add', 'math.multiply']) {
      const inputs = byId(id).inputs;
      expect(inputs.map((port) => port.name)).toEqual(['a', 'b', 'c', 'd']);
      expect(inputs[0]?.type).toEqual({ t: 'param', name: 'num' });
    }
  });

  it('map_range has five numeric inputs and a limit option', () => {
    const map = byId('math.map_range');
    expect(map.inputs.filter((port) => port.static !== true)).toHaveLength(5);
    expect(map.inputs.find((port) => port.name === 'limit')?.default).toBe('clamp');
  });
});

describe('text', () => {
  const byId = (id: string): NodeKind => TEXT_KINDS.find((kind) => kind.id === id)!;

  it('regex outputs a flag, an optional match, groups and all matches', () => {
    const outputs = byId('text.regex').outputs;
    expect(outputs.map((port) => port.name)).toEqual(['matched', 'match', 'groups', 'all']);
    expect(outputs[1]?.optional).toBe(true);
  });

  it('pattern kinds explain the pattern', () => {
    for (const id of ['text.split', 'text.replace', 'text.regex']) {
      expect(byId(id).description).toContain('regex');
    }
  });

  it('format fills a fixed template from four wired slots', () => {
    const format = byId('text.format');
    expect(format.inputs.map((port) => port.name)).toEqual([
      'template',
      'a',
      'b',
      'c',
      'd',
      'places',
      'grouping',
    ]);
    expect(format.inputs[0]?.static).toBe(true);
  });

  it('test offers the five checks', () => {
    const test = byId('text.test').inputs.find((port) => port.name === 'test')?.type;
    expect(test?.t === 'choice' && test.options.map((item) => item.id)).toEqual([
      'contains',
      'starts_with',
      'ends_with',
      'equals',
      'is_empty',
    ]);
  });

  it('join and split use lists of text', () => {
    expect(byId('text.join').inputs[0]?.type).toEqual({ t: 'list', of: { t: 'text' } });
    expect(byId('text.split').outputs[0]?.type).toEqual({ t: 'list', of: { t: 'text' } });
  });

  it('summaries render with their input ports only', () => {
    for (const kind of ALL) expect(kindProblems(kind)).toEqual([]);
  });
});
