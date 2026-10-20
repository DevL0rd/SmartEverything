import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import { Ids, automation, scope, setLight } from '../../../model/canvas/canvas-fixtures';
import { applied } from './inspector-fixtures';
import {
  DEFAULT_TOGETHER_WIDTH,
  LIMIT_START_PASSES,
  LIMIT_START_TIME_MS,
  breakTarget,
  concurrencyOps,
  exitOps,
  forEachView,
  gapOps,
  hasLoopLimits,
  isLimited,
  limitOps,
  loopLimitView,
  nextLimit,
  returnExit,
  targetOps,
} from './loop-model';

function loop(kind: string, ports: FlowNode['ports'] = {}): FlowNode {
  return {
    id: '00000000-0000-4000-8000-000000000009',
    key: 'lp',
    kind,
    ports,
    scopes: { body: scope([]) },
  };
}

function programWith(node: FlowNode): ReturnType<typeof automation> {
  return automation([node]);
}

function reread(program: Program, key: string): FlowNode {
  const entry = indexProgram(program).byKey.get(key);
  if (entry?.kind !== 'node') throw new Error(`no node ${key}`);
  return entry.node;
}

describe('loop limits', () => {
  it('belong to Repeat, While, Do until and Loop until break only', () => {
    expect(hasLoopLimits(NODE_REGISTRY.get('flow.repeat'))).toBe(true);
    expect(hasLoopLimits(NODE_REGISTRY.get('flow.while'))).toBe(true);
    expect(hasLoopLimits(NODE_REGISTRY.get('flow.do_until'))).toBe(true);
    expect(hasLoopLimits(NODE_REGISTRY.get('flow.forever'))).toBe(true);
    expect(hasLoopLimits(NODE_REGISTRY.get('flow.for_each'))).toBe(false);
    expect(hasLoopLimits(undefined)).toBe(false);
  });

  it('shows no limit for a loop with nothing stored', () => {
    const view = loopLimitView(loop('flow.while'), 'flow.while');
    expect(view).toMatchObject({
      gap: undefined,
      gapCaption: 'Before checking again',
      showsPasses: true,
      passes: undefined,
      time: undefined,
      onLimit: 'fail',
      note: undefined,
    });
    expect(isLimited(view)).toBe(false);
    expect(loopLimitView(loop('flow.forever'), 'flow.forever')).toMatchObject({
      gapCaption: 'Before the next pass',
      showsPasses: true,
      passes: undefined,
      time: undefined,
    });
  });

  it('words the gap by loop kind and shows passes only where they apply', () => {
    expect(loopLimitView(loop('flow.repeat'), 'flow.repeat')).toMatchObject({
      gapCaption: 'Not after the last pass',
      showsPasses: false,
      passes: undefined,
    });
    expect(loopLimitView(loop('flow.do_until'), 'flow.do_until')).toMatchObject({
      gapCaption: 'Not after the last pass',
      showsPasses: true,
    });
  });

  it('reads what is stored', () => {
    const node = loop('flow.while', {
      gap: { lit: 2500 },
      limit: { lit: { iterations: 5, time: 9000, onLimit: 'end', note: 'Gave up' } },
    });
    expect(loopLimitView(node, 'flow.while')).toMatchObject({
      gap: 2500,
      passes: 5,
      time: 9000,
      onLimit: 'end',
      note: 'Gave up',
    });
  });

  it('merges a change into the whole limit and drops blank notes and removed values', () => {
    const view = loopLimitView(
      loop('flow.while', {
        limit: {
          lit: { iterations: LIMIT_START_PASSES, time: LIMIT_START_TIME_MS, onLimit: 'fail' },
        },
      }),
      'flow.while',
    );
    expect(isLimited(view)).toBe(true);
    expect(nextLimit(view, { iterations: 7 })).toEqual({
      iterations: 7,
      time: LIMIT_START_TIME_MS,
      onLimit: 'fail',
    });
    expect(nextLimit(view, { time: undefined })).toEqual({
      iterations: LIMIT_START_PASSES,
      onLimit: 'fail',
    });
    expect(nextLimit(view, { onLimit: 'end', note: '' })).toEqual({
      iterations: LIMIT_START_PASSES,
      time: LIMIT_START_TIME_MS,
      onLimit: 'end',
    });
  });

  it('goes back to no limit when the last limit is turned off', () => {
    const view = loopLimitView(
      loop('flow.while', { limit: { lit: { time: 9000, onLimit: 'end' } } }),
      'flow.while',
    );
    expect(nextLimit(view, { time: undefined })).toBeNull();
    expect(
      nextLimit(loopLimitView(loop('flow.while'), 'flow.while'), { onLimit: 'end' }),
    ).toBeNull();
    const program = programWith(
      loop('flow.while', {
        condition: { lit: true },
        limit: { lit: { time: 9000, onLimit: 'end' } },
      }),
    );
    const cleared = applied(program, limitOps('lp', null));
    expect(reread(cleared, 'lp').ports?.['limit']).toBeUndefined();
  });

  it('writes a limit and a gap that the program accepts', () => {
    const program = programWith(loop('flow.while', { condition: { lit: true } }));
    const view = loopLimitView(reread(program, 'lp'), 'flow.while');
    const limited = applied(
      program,
      limitOps(
        'lp',
        nextLimit(view, { time: LIMIT_START_TIME_MS, onLimit: 'end', note: 'Stopped' }),
      ),
    );
    expect(reread(limited, 'lp').ports?.['limit']).toEqual({
      lit: {
        onLimit: 'end',
        time: LIMIT_START_TIME_MS,
        note: 'Stopped',
      },
    });
    const gapped = applied(limited, gapOps('lp', 1500));
    expect(reread(gapped, 'lp').ports?.['gap']).toEqual({ lit: 1500 });
    expect(reread(applied(gapped, gapOps('lp', null)), 'lp').ports?.['gap']).toBeUndefined();
  });
});

describe('For each at the same time', () => {
  const kind = NODE_REGISTRY.get('flow.for_each');

  it('is one at a time unless the width is above one', () => {
    if (kind === undefined) throw new Error('no flow.for_each');
    expect(forEachView(loop('flow.for_each'), kind)).toEqual({
      together: false,
      width: 1,
      most: Number.MAX_SAFE_INTEGER,
      collecting: false,
      reversed: false,
    });
    const wide = loop('flow.for_each', { concurrency: { lit: 8 }, reverse: { lit: true } });
    expect(forEachView(wide, kind)).toMatchObject({ together: true, width: 8, reversed: true });
  });

  it('notices a collected value', () => {
    if (kind === undefined) throw new Error('no flow.for_each');
    const node = loop('flow.for_each', { collect: { wire: { from: 'lp', port: 'item' } } });
    expect(forEachView(node, kind).collecting).toBe(true);
  });

  it('writes the width and removes the port to go back to one at a time', () => {
    const program = programWith(loop('flow.for_each', { items: { lit: [1, 2] } }));
    const wide = applied(program, concurrencyOps('lp', DEFAULT_TOGETHER_WIDTH));
    expect(reread(wide, 'lp').ports?.['concurrency']).toEqual({ lit: DEFAULT_TOGETHER_WIDTH });
    const serial = applied(wide, concurrencyOps('lp', 1));
    expect(reread(serial, 'lp').ports?.['concurrency']).toBeUndefined();
  });
});

describe('Break and Continue target', () => {
  it('reads the loop key and treats an empty target as the innermost loop', () => {
    expect(breakTarget({ ...loop('flow.break'), ports: { target: { lit: 'outer' } } })).toBe(
      'outer',
    );
    expect(breakTarget({ ...loop('flow.break'), ports: { target: { lit: '' } } })).toBeUndefined();
    expect(breakTarget(loop('flow.break'))).toBeUndefined();
  });

  it('writes and clears the target', () => {
    const ids = new Ids();
    const leave: FlowNode = { ...ids.next(), kind: 'flow.break' };
    const program = automation([
      {
        ...ids.next(),
        kind: 'flow.repeat',
        ports: { times: { lit: 2 } },
        scopes: { body: scope([leave, setLight(ids, null)]) },
      },
    ]);
    const targeted = applied(program, targetOps(leave.key, 'n2'));
    expect(reread(targeted, leave.key).ports?.['target']).toEqual({ lit: 'n2' });
    expect(
      reread(applied(targeted, targetOps(leave.key, undefined)), leave.key).ports?.['target'],
    ).toBeUndefined();
  });
});

describe('Return exit', () => {
  it('reads and writes the exit', () => {
    expect(returnExit({ ...loop('flow.return'), ports: { exit: { lit: 'failed' } } })).toBe(
      'failed',
    );
    expect(returnExit(loop('flow.return'))).toBeUndefined();
    expect(exitOps('r', 'failed')).toEqual([
      { op: 'set', key: 'r', ports: { exit: { lit: 'failed' } } },
    ]);
  });
});
