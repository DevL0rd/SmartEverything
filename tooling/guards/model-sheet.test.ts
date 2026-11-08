import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  SHEET_VIEWS,
  collectSpecs,
  isTaskId,
  matchesId,
  parseArgs,
  planSheet,
  shotSignals,
  taskFolders,
} from '../model-sheet';

const VIEW = { yaw: 30, pitch: 12, fov: 28, padding: 0.1 };

const SHOT = {
  id: 'spinning',
  when: {
    anyOf: [
      {
        allOf: [
          { signal: 'power', op: 'eq', value: true },
          { signal: 'speed', op: 'gt', value: 0 },
        ],
      },
    ],
  },
  focus: 'blades',
  zoom: 2,
  yaw: 10,
  pitch: 5,
  easeMs: 400,
  loopS: 1,
  symmetry: 72,
  stillAt: 0.25,
};

const SPEC: ModelSpec = MODEL_SPEC.parse({
  schema: 1,
  id: 'dev.fan.sheet-test',
  version: '1.0.0',
  title: 'Sheet fan',
  category: 'climate',
  footprint: { width: 0.3, depth: 0.3, height: 1 },
  framing: { tile: VIEW, card: VIEW, hero: VIEW },
  shots: [SHOT],
  materials: { body: { finish: 'matte-white' } },
  parts: [
    {
      id: 'shell',
      geometry: { type: 'roundedBox', width: 0.25, height: 1, depth: 0.25, radius: 0.04 },
      material: 'body',
    },
    {
      id: 'blades',
      parent: 'shell',
      geometry: { type: 'roundedBox', width: 0.2, height: 0.02, depth: 0.02, radius: 0.005 },
      material: 'body',
    },
  ],
  states: { off: { power: false }, on: { power: true, speed: 50 } },
});

describe('model sheet arguments and filters', () => {
  it('reads filters and options and rejects unknown options', () => {
    const options = parseArgs(['DM01', 'dev.light.*', '--frames', '12', '--dpr', '3']);
    expect(options).toMatchObject({ filters: ['DM01', 'dev.light.*'], frames: 12, dpr: 3 });
    expect(parseArgs(['--help']).help).toBe(true);
    expect(() => parseArgs(['--size'])).toThrow('unknown option');
    expect(() => parseArgs(['--frames'])).toThrow('needs a value');
  });

  it('matches exact ids, prefixes and task ids', () => {
    expect(matchesId('dev.light.bulb-a60', 'dev.light.*')).toBe(true);
    expect(matchesId('dev.light.bulb-a60', 'dev.light.bulb')).toBe(false);
    expect(['DM01', 'FC38', 'MS5b'].every(isTaskId)).toBe(true);
    expect(isTaskId('dev.light.bulb-a60')).toBe(false);
  });

  it('reads the owned source folders of a task brief and skips tests', () => {
    const brief = [
      '## Owned files (edit ONLY these)',
      '- packages/models/src/devices/light/*',
      '- packages/models/src/catalogue/structure/fc01/* (your own subfolder)',
      '- their spec tests: packages/models/test/devices/dm01/*.test.ts',
      '',
      '## Dependencies',
      '- packages/other/src/x.ts',
    ].join('\n');
    expect(taskFolders(brief)).toEqual([
      'packages/models/src/devices/light',
      'packages/models/src/catalogue/structure/fc01',
    ]);
  });

  it('collects valid specs from module values and arrays once per id', () => {
    expect(collectSpecs([SPEC, [SPEC, { id: 'broken' }], 'text'])).toEqual([SPEC]);
  });
});

describe('model sheet plan', () => {
  it('derives signals that activate a shot from its condition', () => {
    const shot = SPEC.shots?.[0];
    expect(shot).toBeDefined();
    if (shot !== undefined) expect(shotSignals(SPEC, shot)).toEqual({ power: true, speed: 1 });
  });

  it('lays out every view, state, shot frame and both themes', () => {
    const plan = planSheet(SPEC, 4, 2);
    expect(plan.cells).toHaveLength(2 * (3 * 2 + 3 * 4));
    for (const theme of ['light', 'dark'] as const) {
      const cells = plan.cells.filter((cell) => cell.theme === theme);
      expect(new Set(cells.map((cell) => cell.view))).toEqual(new Set(['tile', 'card', 'hero']));
      expect(cells.filter((cell) => cell.shot === 'spinning').map((cell) => cell.timeS)).toEqual([
        0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75,
      ]);
    }
    const hero = plan.cells.find((cell) => cell.view === 'hero');
    expect(hero).toMatchObject({ w: SHEET_VIEWS.hero.w, h: SHEET_VIEWS.hero.h, lod: 2 });
    expect(plan.cells.every((cell) => cell.x + cell.w <= plan.width)).toBe(true);
    expect(plan.cells.every((cell) => cell.y + cell.h <= plan.height)).toBe(true);
  });
});
