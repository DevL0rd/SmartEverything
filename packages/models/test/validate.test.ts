import { describe, expect, it } from 'vitest';
import {
  AUTHORING_MATERIAL_SLOTS,
  AUTHORING_TRIANGLE_TARGETS,
  MODEL_REGISTRY,
  checkAuthoring,
  checkRegistry,
  colorMaterial,
  part,
  roundedBox,
  slats,
} from '../src/index';
import { lampSpec } from './fixture';

describe('the registry', () => {
  it('holds only specs that pass every authoring check with unique ids and aliases', () => {
    expect(checkRegistry(MODEL_REGISTRY)).toStrictEqual([]);
  });

  it('exposes the authoring targets of the plan', () => {
    expect(AUTHORING_TRIANGLE_TARGETS).toStrictEqual({ 0: 1500, 1: 6000, 2: 25000 });
    expect(AUTHORING_MATERIAL_SLOTS).toStrictEqual({ body: 3, accent: 1 });
  });
});

describe('checkAuthoring', () => {
  it('accepts a light spec and reports its triangles per level of detail', () => {
    const report = checkAuthoring(lampSpec());

    expect(report.problems).toStrictEqual([]);
    expect(report.spec?.id).toBe('dev.test-lamp');
    expect(report.triangles).toStrictEqual({ 0: 180, 1: 444, 2: 2232 });
  });

  it('accepts a spec without channels and states', () => {
    const bare = Object.fromEntries(
      Object.entries(lampSpec()).filter(([key]) => key !== 'channels' && key !== 'states'),
    );

    expect(checkAuthoring(bare).problems).toStrictEqual([]);
  });

  it('counts a part only from its minimum level of detail', () => {
    const lamp = lampSpec();
    const lone = { ...lamp, parts: lamp.parts.filter((entry) => entry.id !== 'trim') };

    expect(checkAuthoring(lone).triangles[2]).toBe(1260);
  });

  it('reports schema problems with their path and no triangles', () => {
    const report = checkAuthoring({ ...lampSpec(), id: 'Bad Id' });

    expect(report.spec).toBeUndefined();
    expect(report.triangles).toStrictEqual({ 0: 0, 1: 0, 2: 0 });
    expect(report.problems.map((problem) => problem.path)).toStrictEqual([['id']]);
  });

  it('reports the schema problem of a non-object input', () => {
    expect(checkAuthoring(null).problems).toHaveLength(1);
  });

  it('allows three material slots plus the accent and rejects a fourth', () => {
    const lamp = lampSpec();
    const four = {
      ...lamp,
      materials: {
        ...lamp.materials,
        trim: colorMaterial('#111111'),
        screen: colorMaterial('#222222'),
      },
    };
    const report = checkAuthoring(four);

    expect(report.problems).toStrictEqual([
      { path: ['materials'], message: 'at most 3 material slots plus accent, found 4' },
    ]);
  });

  it('rejects a level of detail above its triangle target and names the numbers', () => {
    const lamp = lampSpec();
    const heavy = {
      ...lamp,
      parts: [
        ...lamp.parts,
        part(
          'louvre',
          slats({ count: 200, spacing: 0.001, width: 0.1, height: 0.001, depth: 0.1 }),
          'body',
        ),
      ],
    };
    const report = checkAuthoring(heavy);

    expect(report.problems.map((problem) => problem.message)).toStrictEqual([
      'lod 0 estimates 2580 triangles, target 1500',
      'lod 1 estimates 22044 triangles, target 6000',
      'lod 2 estimates 62232 triangles, target 25000',
    ]);
  });

  it('takes the triangle targets from the options', () => {
    const report = checkAuthoring(lampSpec(), { triangleTargets: { 0: 100, 1: 6000, 2: 25000 } });

    expect(report.problems.map((problem) => problem.message)).toStrictEqual([
      'lod 0 estimates 180 triangles, target 100',
    ]);
  });

  it('rejects an unknown channel source, a bad map and an unknown state signal', () => {
    const lamp = lampSpec();
    const channel = lamp.channels?.[0];
    const broken = {
      ...lamp,
      channels: channel === undefined ? [] : [{ ...channel, source: 'warmth' }],
      states: { on: { glow: 1 } },
    };
    const messages = checkAuthoring(broken).problems.map((problem) => problem.message);

    expect(messages).toStrictEqual(['unknown signal warmth', 'unknown signal glow']);
  });

  it('rejects capability sources unless the options allow a plugin model', () => {
    const lamp = lampSpec();
    const channel = lamp.channels?.[0];
    const plugin = {
      ...lamp,
      channels: channel === undefined ? [] : [{ ...channel, source: { capability: 'warmth' } }],
      states: { on: { warmth: 1 } },
    };

    expect(checkAuthoring(plugin).problems.map((problem) => problem.message)).toStrictEqual([
      'capability source warmth needs a plugin model',
      'unknown signal warmth',
    ]);
    expect(checkAuthoring(plugin, { capabilitySources: true }).problems).toStrictEqual([]);
  });

  it('rejects a bound size that leaves 50 metres or stops being finite at a parameter limit', () => {
    const reach = checkAuthoring({
      ...lampSpec(),
      params: {
        reach: { min: 0, max: 100, default: 1, unit: 'm' },
        huge: { min: 0, max: 1e308, default: 1, unit: 'm' },
      },
      parts: [
        part(
          'beam',
          roundedBox({ width: { param: 'reach', scale: 100 }, height: 1, depth: 1, radius: 0 }),
          'body',
        ),
        part('far', roundedBox({ width: 1, height: 1, depth: 1, radius: 0 }), 'body', {
          transform: { position: [{ param: 'huge', scale: 10 }, { param: 'reach' }, 0] },
        }),
      ],
      channels: [],
      states: {},
    });

    expect(reach.problems).toStrictEqual([
      { path: ['parts', 0, 'geometry', 'width'], message: 'metres lie within 50' },
      { path: ['parts', 1, 'transform', 'position', 0], message: 'metres are finite' },
      { path: ['parts', 1, 'transform', 'position', 1], message: 'metres lie within 50' },
    ]);
  });

  it('leaves bound values that are not metres alone', () => {
    const lamp = lampSpec();
    const spun = {
      ...lamp,
      params: { turn: { min: 0, max: 1e9, default: 1, unit: 'deg' as const } },
      parts: [
        part('base', roundedBox({ width: 0.1, height: 0.1, depth: 0.1, radius: 0 }), 'body', {
          transform: {
            rotation: [{ param: 'turn' }, 0, 0],
            scale: [{ param: 'turn', offset: 2 }, 1, 1],
          },
        }),
      ],
      channels: [],
      states: {},
    };

    expect(checkAuthoring(spun).problems).toStrictEqual([]);
  });
});

describe('checkRegistry', () => {
  it('prefixes problems with the spec id and falls back to the position for invalid specs', () => {
    const lamp = lampSpec();
    const crowded = {
      ...lamp,
      materials: {
        ...lamp.materials,
        trim: colorMaterial('#111111'),
        screen: colorMaterial('#222222'),
      },
    };
    const problems = checkRegistry([crowded, 3, { ...lamp, id: 'dev.second' }]);

    expect(problems.map((problem) => problem.id)).toStrictEqual(['dev.test-lamp', '#1']);
  });

  it('reports a duplicate id and an alias that another model already uses', () => {
    const lamp = lampSpec();
    const aliased = (id: string, aliases: string[]): Record<string, unknown> => ({
      ...lamp,
      id,
      meta: { names: { display: id }, aliases },
    });
    const problems = checkRegistry([
      lamp,
      aliased('dev.second', ['legacy', 'dev.test-lamp']),
      aliased('dev.third', ['legacy']),
      { ...lamp },
    ]);

    expect(
      problems.map((problem) => `${problem.id} ${problem.path.join('.')} ${problem.message}`),
    ).toStrictEqual([
      'dev.test-lamp id dev.test-lamp is already used by dev.test-lamp',
      'dev.second meta.aliases.1 dev.test-lamp is already used by dev.test-lamp',
      'dev.third meta.aliases.0 legacy is already used by dev.second',
    ]);
  });

  it('passes a clean list', () => {
    const lamp = lampSpec();

    expect(checkRegistry([lamp, { ...lamp, id: 'dev.other' }])).toStrictEqual([]);
  });
});
