import { describe, expect, it } from 'vitest';
import type { TargetState } from '@smarteverything/domain';
import { MINI_STAGE_DOTS, miniStageOf } from './mini-stage';

const state = (perMember: readonly { deviceId: string; value: number }[]): TargetState => ({
  members: perMember.length,
  online: perMember.length,
  on: perMember.length,
  power: 'on',
  level: { min: 10, max: 90, mean: 50, perMember: [...perMember] },
  whiteTemperature: null,
  colours: [],
  support: {},
});

describe('the mini stage of a group card', () => {
  it('draws one dot per member with its power, colour and level opacity', () => {
    const stage = miniStageOf(['a', 'b', 'c'], {
      state: state([
        { deviceId: 'a', value: 100 },
        { deviceId: 'b', value: 0 },
      ]),
      powers: { a: 'on', b: 'on', c: 'offline' },
      colours: { a: '#ff0000' },
    });
    expect(stage.hidden).toBe(0);
    expect(stage.dots.map((dot) => [dot.id, dot.power, dot.colour])).toStrictEqual([
      ['a', 'on', '#ff0000'],
      ['b', 'on', null],
      ['c', 'offline', null],
    ]);
    const [bright, dim] = stage.dots;
    expect(bright?.opacity).toBeGreaterThan(dim?.opacity ?? 1);
  });

  it('treats a member with no known power as off', () => {
    const stage = miniStageOf(['a'], { state: state([]), powers: {}, colours: {} });
    expect(stage.dots[0]?.power).toBe('off');
  });

  it('shows at most eight dots and counts the rest', () => {
    const ids = Array.from({ length: 11 }, (_, index) => `m${String(index)}`);
    const stage = miniStageOf(ids, { state: state([]), powers: {}, colours: {} });
    expect(stage.dots).toHaveLength(MINI_STAGE_DOTS);
    expect(stage.hidden).toBe(3);
  });
});
