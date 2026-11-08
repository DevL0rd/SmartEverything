import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { ProgramV4 } from '@smarteverything/domain';
import {
  decisionProgram,
  forkProgram,
  idOf,
  laneRowsProgram,
  loopProgram,
} from './graph-scene-fixtures';
import { projectGraphScene } from './project-graph-scene';
import { record } from './run-records-fixtures';
import { EMPTY_GRAPH_RUN_OVERLAY, GRAPH_RUN_OVERLAY, graphRunOverlay } from './run-overlay';
import type { Activation } from '../../runs/run-view/run-activation';

function overlayOf(
  program: ProgramV4,
  records: readonly Activation[],
  extra: { selected?: ReadonlyMap<string, number>; wakeAt?: string | null; live?: boolean } = {},
): ReturnType<typeof graphRunOverlay> {
  return graphRunOverlay({
    scene: projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP }),
    records,
    selected: extra.selected ?? new Map(),
    wakeAt: extra.wakeAt ?? null,
    live: extra.live ?? false,
    zone: 'UTC',
  });
}

describe('graphRunOverlay node states', () => {
  it('maps every record status to a node state by node id', () => {
    const overlay = overlayOf(laneRowsProgram(), [
      record('hold', { seq: 1, status: 'waiting' }),
      record('late', { seq: 2, status: 'running' }),
      record('routed', { seq: 3, status: 'failed', error: 'Unreachable: lamp' }),
      record('rescue', { seq: 4, status: 'cancelled' }),
      record('after', { seq: 5, status: 'skipped' }),
      record('temp', { seq: 6 }),
    ]);
    expect(overlay.nodes[idOf('hold')]).toEqual({ state: 'waiting', text: 'Waiting' });
    expect(overlay.nodes[idOf('late')]).toEqual({ state: 'running' });
    expect(overlay.nodes[idOf('routed')]).toEqual({ state: 'failed', text: 'Unreachable: lamp' });
    expect(overlay.nodes[idOf('rescue')]).toEqual({ state: 'skipped' });
    expect(overlay.nodes[idOf('after')]).toEqual({ state: 'skipped' });
    expect(overlay.nodes[idOf('temp')]).toEqual({ state: 'done' });
    expect(overlay.nodes[idOf('inside')]).toBeUndefined();
  });

  it('keeps the latest record of a node and the wake time of a waiting one', () => {
    const overlay = overlayOf(
      laneRowsProgram(),
      [
        record('hold', { seq: 1, status: 'running' }),
        record('hold', { seq: 2, status: 'waiting' }),
      ],
      { wakeAt: '2026-10-19T10:30:00.000Z' },
    );
    expect(overlay.nodes[idOf('hold')]).toEqual({
      state: 'waiting',
      text: 'wakes at 10:30 AM',
      wakeAt: '2026-10-19T10:30:00.000Z',
    });
  });

  it('carries the live flag and the taken wires', () => {
    const overlay = overlayOf(
      decisionProgram(),
      [record('start', { seq: 1 }), record('lamp', { seq: 3 }), record('check', { seq: 4 })],
      { live: true },
    );
    expect(overlay.live).toBe(true);
    expect(overlay.taken).toEqual(
      expect.arrayContaining([`exec:${idOf('check')}.x:row:${idOf('check:dark')}>${idOf('lamp')}`]),
    );
  });
});

describe('graphRunOverlay passes and progress', () => {
  const records = [
    record('show', { seq: 2, loops: [['each', 1]] }),
    record('show', { seq: 4, loops: [['each', 2]], status: 'failed', error: 'Boom' }),
    record('show', { seq: 6, loops: [['each', 3]], status: 'running' }),
  ];

  it('steps the loop to its last pass by default', () => {
    const overlay = overlayOf(loopProgram(), records);
    expect(overlay.stepper[idOf('each')]).toEqual({ position: 3, total: 3, iteration: 3 });
    expect(overlay.nodes[idOf('show')]).toEqual({ state: 'running' });
    expect(overlay.nodes[idOf('each')]).toEqual({ state: 'running', iteration: 3 });
  });

  it('shows the records of the chosen pass', () => {
    const overlay = overlayOf(loopProgram(), records, {
      selected: new Map([[idOf('each'), 2]]),
    });
    expect(overlay.stepper[idOf('each')]).toEqual({ position: 2, total: 3, iteration: 2 });
    expect(overlay.nodes[idOf('show')]).toEqual({ state: 'failed', text: 'Boom' });
  });

  it('shows how many paths of a Wait for all are done', () => {
    const overlay = overlayOf(forkProgram('all'), [
      record('both', { seq: 2 }),
      record('l', { seq: 3 }),
      record('r', { seq: 4, status: 'running' }),
    ]);
    expect(overlay.nodes[idOf('meet')]).toEqual({
      state: 'waiting',
      progress: { done: 1, total: 2 },
    });
  });
});

describe('the run overlay contract', () => {
  it('accepts what the builder produces and the empty overlay, and rejects a stray field', () => {
    const overlay = overlayOf(loopProgram(), [
      record('show', { seq: 2, loops: [['each', 1]] }),
      record('each', { seq: 3 }),
    ]);
    expect(GRAPH_RUN_OVERLAY.safeParse(overlay).success).toBe(true);
    expect(GRAPH_RUN_OVERLAY.safeParse(EMPTY_GRAPH_RUN_OVERLAY).success).toBe(true);
    expect(GRAPH_RUN_OVERLAY.safeParse({ ...overlay, extra: 1 }).success).toBe(false);
    expect(GRAPH_RUN_OVERLAY.safeParse({ ...overlay, version: 2 }).success).toBe(false);
  });

  it('builds the empty overlay for a run without records', () => {
    expect(overlayOf(decisionProgram(), [])).toEqual(EMPTY_GRAPH_RUN_OVERLAY);
  });
});
