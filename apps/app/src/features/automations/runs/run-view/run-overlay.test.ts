import { describe, expect, it } from 'vitest';
import type { RunOverlay } from '../../model/canvas/contract';
import { clock } from '../../../../format/time';
import { parseActivationPath, type Activation } from './run-activation';
import { FOLLOW_OFF, followReduce } from './follow';
import { gapText, resolveLoops, stripOf } from './run-loops';
import { overlayOf, runningNodeOf, statusAt } from './run-overlay';
import { boundsOf, offsetOf, timelineOf } from './run-timeline';
import { memoryLines, previewText } from './run-values';

const START = Date.parse('2026-10-19T10:00:00.000Z');

function act(path: string, patch: Partial<Activation> = {}): Activation {
  const parsed = parseActivationPath(path);
  return {
    path,
    nodeId: parsed.nodeId,
    loops: parsed.loops,
    iteration: 1,
    status: 'succeeded',
    seq: 1,
    startMs: START,
    endMs: START + 100,
    preview: null,
    truncated: false,
    error: null,
    commandIds: [],
    ...patch,
  };
}

function lights(count: number): readonly Activation[] {
  return Array.from({ length: count }, (_, index) =>
    act(`loop#l1[${String(index + 1)}]/dim`, {
      seq: index + 10,
      startMs: START + index * 1000,
      endMs: START + index * 1000 + 500,
      preview: { value: (index + 1) * 10 },
      status: index === 1 ? 'failed' : 'succeeded',
      error: index === 1 ? 'Unreachable: Kitchen lamp' : null,
    }),
  );
}

const NAMES = new Map([['l1', 'Light']]);

function overlay(
  activations: readonly Activation[],
  selected = new Map<string, number>(),
  at: number | null = null,
): RunOverlay {
  const { loops, chosen } = resolveLoops(activations, selected);
  return overlayOf({
    activations,
    chosen,
    loops,
    itemNames: NAMES,
    at,
    wakeAt: null,
    zone: 'UTC',
  });
}

describe('activation paths', () => {
  it('reads the node id and every loop pass from a frame path', () => {
    expect(parseActivationPath('call#n3/loop#n7[4]/n9')).toEqual({
      nodeId: 'n9',
      loops: [{ nodeId: 'n7', iteration: 4 }],
    });
    expect(parseActivationPath('n1')).toEqual({ nodeId: 'n1', loops: [] });
  });
});

describe('the loop stepper model', () => {
  it('names the item and its place, and follows the chosen pass', () => {
    const all = [...lights(4), act('l1', { seq: 5 })];
    const last = overlay(all);
    expect(last['l1']?.text).toBe('Light 4 of 4');
    expect(last['dim']).toEqual({ state: 'done', text: '40' });
    const second = overlay(all, new Map([['l1', 2]]));
    expect(second['l1']?.text).toBe('Light 2 of 4');
    expect(second['dim']).toEqual({ state: 'failed', text: 'Unreachable: Kitchen lamp' });
  });

  it('falls back to the last pass when the chosen one does not exist', () => {
    const { loops } = resolveLoops(lights(3), new Map([['l1', 99]]));
    expect(loops[0]?.position).toBe(3);
  });

  it('resolves an inner loop inside the chosen outer pass only', () => {
    const nested = [
      act('loop#o[1]/loop#i[1]/x', { seq: 1 }),
      act('loop#o[2]/loop#i[1]/x', { seq: 2 }),
      act('loop#o[2]/loop#i[2]/x', { seq: 3 }),
    ];
    const first = resolveLoops(nested, new Map([['o', 1]]));
    expect(first.loops.map((loop) => [loop.nodeId, loop.total])).toEqual([
      ['o', 2],
      ['i', 1],
    ]);
    const second = resolveLoops(nested, new Map([['o', 2]]));
    expect(second.loops[1]?.total).toBe(2);
  });

  it('colours a pass by its outcome and sums up the middle of a long loop', () => {
    const long = resolveLoops(lights(40), new Map()).loops[0];
    expect(long?.outcomes[1]).toBe('failed');
    const strip = stripOf(long!);
    const gap = strip.find((item) => item.kind === 'gap');
    expect(gap).toMatchObject({ kind: 'gap', from: 7, to: 34, failed: 0 });
    expect(gap?.kind === 'gap' ? gapText(gap) : '').toBe('passes 7 to 34: 28 ok');
    expect(stripOf(resolveLoops(lights(3), new Map()).loops[0]!)).toHaveLength(3);
  });
});

describe('the run overlay', () => {
  it('shows a value badge, a failure and waiting text from the stored node records', () => {
    const records = [
      act('a', { seq: 1, preview: { value: 42.456 } }),
      act('b', { seq: 2, status: 'failed', error: 'Timeout: no answer' }),
      act('c', { seq: 3, status: 'waiting', endMs: null }),
      act('d', { seq: 4, status: 'skipped', startMs: null, endMs: null }),
      act('e', { seq: 5, preview: { value: 'Kitchen lamp' }, truncated: true }),
    ];
    const { loops, chosen } = resolveLoops(records, new Map());
    const shown = overlayOf({
      activations: records,
      chosen,
      loops,
      itemNames: NAMES,
      at: null,
      wakeAt: '2026-10-19T14:32:00.000Z',
      zone: 'UTC',
    });
    expect(shown['a']).toEqual({ state: 'done', text: '42.46' });
    expect(shown['b']).toEqual({ state: 'failed', text: 'Timeout: no answer' });
    expect(shown['c']).toEqual({
      state: 'waiting',
      text: `wakes at ${clock('2026-10-19T14:32:00.000Z', 'UTC')}`,
    });
    expect(shown['d']).toEqual({ state: 'skipped' });
    expect(shown['e']?.text).toBe('Kitchen lamp…');
  });

  it('keeps the newest activation of a node that ran more than once', () => {
    const shown = overlay([
      act('x', { seq: 1, preview: { value: 1 } }),
      act('x', { seq: 2, preview: { value: 2 } }),
    ]);
    expect(shown['x']?.text).toBe('2');
  });

  it('replays states from the records at a scrubbed time and hides what has not started', () => {
    const records = [
      act('a', { seq: 1, startMs: START, endMs: START + 100 }),
      act('b', { seq: 2, startMs: START + 200, endMs: START + 400 }),
    ];
    expect(statusAt(records[1]!, START + 100)).toBeNull();
    expect(statusAt(records[1]!, START + 300)).toBe('running');
    expect(statusAt(records[1]!, START + 500)).toBe('succeeded');
    const early = overlay(records, new Map(), START + 300);
    expect(early['a']?.state).toBe('done');
    expect(early['b']?.state).toBe('running');
    expect(overlay(records, new Map(), START + 50)['a']?.state).toBe('running');
    expect(overlay(records, new Map(), START + 50)['b']).toBeUndefined();
  });

  it('finds the newest running node to follow', () => {
    const records = [
      act('a', { seq: 1, status: 'running' }),
      act('b', { seq: 2, status: 'running' }),
      act('c', { seq: 3 }),
    ];
    expect(runningNodeOf(records, new Map())).toBe('b');
    expect(runningNodeOf([records[2]!], new Map())).toBeNull();
  });
});

describe('values and memory', () => {
  it('writes plain previews', () => {
    const preview = (value: unknown): string | undefined =>
      previewText(act('p', { preview: { value } }));
    expect(preview(true)).toBe('Yes');
    expect(preview([1, 2, 3])).toBe('3 items');
    expect(preview([1])).toBe('1 item');
    expect(preview({ a: 1 })).toBe('1 field');
    expect(preview(null)).toBeUndefined();
  });

  it('lists what a stateful node remembers', () => {
    const node = act('s', { preview: { memory: { 'Place in the list': '3 of 5' } } });
    expect(memoryLines(node)).toEqual([{ label: 'Place in the list', value: '3 of 5' }]);
    expect(memoryLines(act('s', { preview: { memory: 'Last level 75 %' } }))).toEqual([
      { label: 'Holds', value: 'Last level 75 %' },
    ]);
    expect(memoryLines(null)).toEqual([]);
  });
});

describe('the timeline band', () => {
  const run = {
    started_at: new Date(START).toISOString(),
    created_at: new Date(START).toISOString(),
    finished_at: new Date(START + 2000).toISOString(),
  };

  it('makes one row per executed node, ordered by first start, with a visible minimum bar', () => {
    const records = [
      act('b', { seq: 2, startMs: START + 500, endMs: START + 500 }),
      act('a', { seq: 1, startMs: START, endMs: START + 400 }),
      act('w', { seq: 3, status: 'waiting', startMs: START + 600, endMs: null }),
      act('q', { seq: 4, startMs: null, endMs: null, status: 'skipped' }),
    ];
    const bounds = boundsOf(run, records);
    const model = timelineOf(records, new Map([['a', 'Dim lamp']]), bounds);
    expect(model.rows.map((row) => row.nodeId)).toEqual(['a', 'b', 'w']);
    expect(model.rows[0]?.title).toBe('Dim lamp');
    expect(model.rows[1]?.segments[0]?.end).toBeGreaterThan(START + 500);
    expect(model.rows[2]?.segments[0]).toMatchObject({ state: 'waiting', end: START + 2000 });
    expect(offsetOf(START + 500, bounds)).toBe(500);
    expect(offsetOf(null, bounds)).toBe(2000);
  });
});

describe('follow', () => {
  it('turns off when the person pans, not when the follow pan settles', () => {
    let state = followReduce(FOLLOW_OFF, { type: 'toggle' });
    state = followReduce(state, { type: 'focused' });
    state = followReduce(state, { type: 'settled' });
    expect(state.on).toBe(true);
    state = followReduce(state, { type: 'settled' });
    expect(state.on).toBe(false);
  });

  it('ignores canvas events while off', () => {
    expect(followReduce(FOLLOW_OFF, { type: 'settled' })).toBe(FOLLOW_OFF);
    expect(followReduce(FOLLOW_OFF, { type: 'focused' })).toBe(FOLLOW_OFF);
  });
});
