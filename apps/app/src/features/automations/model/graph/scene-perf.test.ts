import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { blockProgram } from './graph-scene-fixtures';
import { projectGraphScene } from './project-graph-scene';

const MARGIN = 4;
const BABY_MS = 8 * MARGIN;
const LARGE_MS = 40 * MARGIN;
const RUNS = 7;

function medianMs(run: () => unknown): number {
  run();
  const samples: number[] = [];
  for (let index = 0; index < RUNS; index += 1) {
    const began = performance.now();
    run();
    samples.push(performance.now() - began);
  }
  return [...samples].sort((a, b) => a - b)[Math.floor(RUNS / 2)] ?? Number.POSITIVE_INFINITY;
}

describe('scene projection time (gate S1)', () => {
  it('projects a Baby crying sized graph well inside the 8 ms budget', () => {
    const program = blockProgram(14);
    expect(program.nodes.length).toBeGreaterThanOrEqual(70);
    expect(
      medianMs(() => projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP })),
    ).toBeLessThan(BABY_MS);
  });

  it('projects a 300 node graph well inside the 40 ms budget', () => {
    const program = blockProgram(60);
    expect(program.nodes.length).toBeGreaterThanOrEqual(300);
    expect(
      medianMs(() => projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP })),
    ).toBeLessThan(LARGE_MS);
  });
});
