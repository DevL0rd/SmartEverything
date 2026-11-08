import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { ProgramV4 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { layoutGraph, type GraphLayoutResult, type Rect } from '../../src/graph/layout';
import { EXEC_IN_Y, GAP, HEADER_H, ROW_H, programSizes } from '../../src/graph/metrics';
import {
  automation,
  idOf,
  ifNode,
  join,
  loop,
  start,
  step,
  together,
  tryNode,
  value,
} from './graph-fixtures';

const fromValue = (key: string): { ports: { to: { wire: { from: string; port: string } } } } => ({
  ports: { to: { wire: { from: key, port: 'value' } } },
});

function rect(result: GraphLayoutResult, key: string): Rect {
  const found = result.rects.get(idOf(key));
  if (found === undefined) throw new Error(`no rectangle for ${key}`);
  return found;
}

function overlapping(result: GraphLayoutResult): readonly string[] {
  const boxes = [...result.rects];
  return boxes.flatMap(([a, one], i) =>
    boxes
      .slice(i + 1)
      .flatMap(([b, two]) =>
        one.x < two.x + two.w &&
        two.x < one.x + one.w &&
        one.y < two.y + two.h &&
        two.y < one.y + one.h
          ? [`${a} ${b}`]
          : [],
      ),
  );
}

function nested(): ProgramV4 {
  return automation([
    start('d'),
    ifNode('d', [{ name: 'yes', to: 'lamp' }], 'tell'),
    step('lamp', 'both', fromValue('level')),
    value('level'),
    step('tell', 'both'),
    together('both', [
      { name: 'one', to: 'each' },
      { name: 'two', to: 'say' },
    ]),
    loop('each', 'flow.for_each', 'light', 'meet'),
    step('light'),
    step('say', 'meet', fromValue('words')),
    value('words'),
    join('meet', 'guard'),
    tryNode('guard', { attempt: 'song', catches: [{ name: 'any', to: 'sorry' }] }),
    step('song'),
    step('sorry'),
  ]);
}

function tallSizes(program: ProgramV4): ReadonlyMap<string, { w: number; h: number }> {
  const base = programSizes(program, 'touch', STATIC_KIND_LOOKUP);
  return new Map([...base].map(([id, size]) => [id, { w: size.w, h: size.h + 180 }]));
}

describe('layoutGraph with measured sizes', () => {
  it('keeps every card and value apart when the cards are taller than the metrics', () => {
    const program = nested();
    const result = layoutGraph(program, {
      kinds: STATIC_KIND_LOOKUP,
      direction: 'ltr',
      sizes: tallSizes(program),
    });
    expect(overlapping(result)).toEqual([]);
    expect(rect(result, 'light').x).toBeGreaterThanOrEqual(
      rect(result, 'each').x + rect(result, 'each').w,
    );
    expect(rect(result, 'song').x).toBeGreaterThanOrEqual(
      rect(result, 'guard').x + rect(result, 'guard').w,
    );
  });

  it('uses the sizes it is given for the rectangles', () => {
    const program = nested();
    const sizes = tallSizes(program);
    const result = layoutGraph(program, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr', sizes });
    expect(rect(result, 'lamp').h).toBe(sizes.get(idOf('lamp'))?.h);
  });

  it('has no overlaps top to bottom either', () => {
    const program = nested();
    expect(
      overlapping(
        layoutGraph(program, {
          kinds: STATIC_KIND_LOOKUP,
          direction: 'ttb',
          sizes: tallSizes(program),
        }),
      ),
    ).toEqual([]);
  });
});

describe('layoutGraph value bands', () => {
  it('keeps value cards off the exec line between two steps', () => {
    const result = layoutGraph(nested(), { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    const level = rect(result, 'level');
    const lamp = rect(result, 'lamp');
    expect(level.y + level.h).toBeLessThanOrEqual(lamp.y);
    expect(level.x + level.w).toBeLessThanOrEqual(lamp.x);
    expect(overlapping(result)).toEqual([]);
  });

  it('puts the admit value above and left of Start', () => {
    const base = automation([start('a'), step('a'), value('gate')]);
    const program = { ...base, admit: { wire: { from: 'gate', port: 'value' } } };
    const result = layoutGraph(program, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    const gate = rect(result, 'gate');
    const begin = rect(result, 'start');
    expect(gate.x + gate.w + GAP.value).toBe(begin.x);
    expect(gate.y + gate.h + GAP.valueAbove).toBe(begin.y);
    expect(rect(result, 'a').y).toBe(begin.y);
  });
});

describe('layoutGraph rows and lanes', () => {
  it('lines the first branch up with its row so the wire is straight', () => {
    const program = automation([
      start('d'),
      ifNode('d', [{ name: 'yes', to: 'x' }], 'y'),
      step('x'),
      step('y'),
    ]);
    const result = layoutGraph(program, {
      kinds: STATIC_KIND_LOOKUP,
      direction: 'ltr',
      density: 'touch',
    });
    const rowCentre = rect(result, 'd').y + HEADER_H + ROW_H.touch / 2;
    expect(rect(result, 'x').y + EXEC_IN_Y).toBe(rowCentre);
    expect(rect(result, 'y').y).toBeGreaterThanOrEqual(rect(result, 'x').y + rect(result, 'x').h);
  });
});

describe('layoutGraph with a circle of wires', () => {
  const program = automation([
    start('a'),
    ifNode('a', [{ name: 'yes', to: 'b' }], 'c'),
    step('b', 'm'),
    step('c', 'a'),
    step('m'),
  ]);

  it('still places every node so the bad wire can be seen and fixed', () => {
    const result = layoutGraph(program, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
    expect(result.problemCount).toBe(1);
    expect(Object.keys(result.nodes).sort()).toEqual(program.nodes.map((node) => node.id).sort());
    expect(overlapping(result)).toEqual([]);
  });
});
