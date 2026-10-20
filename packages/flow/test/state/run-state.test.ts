import { describe, expect, it } from 'vitest';
import { resolveBudgets, startBudgets } from '../../src/state/budgets';
import { FLOW_ERRORS } from '../../src/state/errors';
import type { RunState } from '../../src/state/run-state';
import {
  CANCEL_REASON,
  CANCEL_REASONS,
  FRAME,
  FRAME_KINDS,
  LOOP_STATE,
  RUN_STATE,
  WAIT,
  restoreRunState,
  serialiseRunState,
} from '../../src/state/run-state';

const ids = {
  run: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  automation: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  owner: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
  node: '3d4e5f6a-7b8c-4d9e-8f10-2b3c4d5e6f70',
};

const site = { node: ids.node, path: 'body/1', at: 1_000 };

const hash = 'a'.repeat(64);

function state(overrides: Partial<RunState> = {}): RunState {
  return {
    runId: ids.run,
    automationId: ids.automation,
    revision: 4,
    planRefs: [{ id: ids.automation, revision: 4, hash }],
    trigger: null,
    payload: {},
    inputs: {},
    ownerProfileId: ids.owner,
    origin: null,
    causeChain: [],
    frames: [{ id: 'f0', kind: 'root', path: 'body', pc: 0, locals: {}, outputs: {} }],
    captures: {},
    budgets: startBudgets(resolveBudgets(), 0),
    seed: 42,
    ...overrides,
  };
}

const signal = {
  source: 'device',
  kind: 'state',
  subject: 'lamp',
  field: 'on',
  value: true,
  previous: false,
  at: '2026-10-18T03:30:00+07:00',
  profileId: null,
  data: {},
};

describe('run state schema', () => {
  it('accepts a fresh state', () => {
    expect(RUN_STATE.parse(state())).toStrictEqual(state());
  });

  it('accepts a trigger, an origin, a cause chain, captures and a cancel request', () => {
    const full = state({
      trigger: signal,
      inputs: { level: 3, names: ['a', 'b'], nested: { ok: null } },
      origin: { plugin_id: 'hello-plugin', requester: 'approved' },
      causeChain: [{ automationId: ids.automation, runId: ids.run }],
      captures: { 'body/0': 21.5 },
      cancel: { reason: 'user_stop', requestedAt: 5 },
    });
    expect(RUN_STATE.parse(full)).toStrictEqual(full);
  });

  it('refuses anything that is not JSON', () => {
    expect(RUN_STATE.safeParse({ ...state(), inputs: { f: undefined } }).success).toBe(false);
    expect(RUN_STATE.safeParse({ ...state(), extra: 1 }).success).toBe(false);
    expect(RUN_STATE.safeParse(state({ captures: { a: NaN } })).success).toBe(false);
  });

  it('needs a plan, a frame and a bare 64 digit hash', () => {
    expect(RUN_STATE.safeParse(state({ planRefs: [] })).success).toBe(false);
    expect(RUN_STATE.safeParse(state({ frames: [] })).success).toBe(false);
    const bad = { id: ids.automation, revision: 1, hash: 'ABC' };
    expect(RUN_STATE.safeParse(state({ planRefs: [bad] })).success).toBe(false);
  });
});

describe('cancel reasons', () => {
  it('are the closed union of the runtime record plus the loop limit', () => {
    expect(CANCEL_REASONS).toHaveLength(10);
    expect(CANCEL_REASON.safeParse('loop_limit').success).toBe(true);
    expect(CANCEL_REASON.safeParse('other').success).toBe(false);
  });
});

describe('frames', () => {
  const base = { id: 'f1', path: 'body/2', pc: 3, locals: { x: 1 }, outputs: {} };

  it('allow every frame kind', () => {
    for (const kind of FRAME_KINDS) expect(FRAME.safeParse({ ...base, kind }).success).toBe(true);
    expect(FRAME.safeParse({ ...base, kind: 'other' }).success).toBe(false);
  });

  it('keep children, joined outputs and a try state', () => {
    const frame = {
      ...base,
      kind: 'try',
      children: ['f2', 'f3'],
      joinedOutputs: { left: 1 },
      tryState: {
        phase: 'finally',
        row: 'c1',
        completion: { kind: 'error', error: FLOW_ERRORS.Timeout('slow', site) },
      },
    };
    expect(FRAME.parse(frame)).toStrictEqual(frame);
  });

  it('keep every completion a try can be unwinding', () => {
    const completions = [
      { kind: 'normal' },
      { kind: 'break', target: 'outer' },
      { kind: 'continue', target: 'outer' },
      { kind: 'return' },
      { kind: 'return', exit: 'done' },
      { kind: 'stop', failed: true },
      { kind: 'cancelled', reason: 'shutdown' },
    ];
    for (const completion of completions) {
      const frame = { ...base, kind: 'try', tryState: { phase: 'body', completion } };
      expect(FRAME.parse(frame)).toStrictEqual(frame);
    }
    const unknown = {
      ...base,
      kind: 'try',
      tryState: { phase: 'body', completion: { kind: 'x' } },
    };
    expect(FRAME.safeParse(unknown).success).toBe(false);
  });
});

describe('loop state', () => {
  const loop = { index: 2, count: 5, startedAt: 100 };

  it('keeps an absolute deadline', () => {
    const withDeadline = { ...loop, deadlineAt: 3_600_100 };
    expect(LOOP_STATE.parse(withDeadline)).toStrictEqual(withDeadline);
  });

  it('allows an open loop with no count', () => {
    expect(LOOP_STATE.safeParse({ index: 0, count: null, startedAt: 0 }).success).toBe(true);
  });

  it('keeps the items or a reference to them, never both', () => {
    expect(LOOP_STATE.safeParse({ ...loop, items: [1, 2] }).success).toBe(true);
    expect(LOOP_STATE.safeParse({ ...loop, itemsRef: 'captures/a' }).success).toBe(true);
    expect(LOOP_STATE.safeParse({ ...loop, items: [1], itemsRef: 'a' }).success).toBe(false);
  });
});

describe('waits', () => {
  const base = { nodePath: 'body/4', durable: true };

  const waits = [
    { kind: 'duration', ...base, dueAt: 9, late: true },
    { kind: 'until_instant', ...base, dueAt: 9 },
    { kind: 'condition', ...base, deps: ['device:lamp:on'], deadlineAt: 20, holdUntil: 15 },
    {
      kind: 'event',
      ...base,
      matcher: { source: 'device', kind: 'state', subject: 'lamp' },
      parkedAt: 3,
      deadlineAt: 20,
    },
    { kind: 'answer', ...base, notificationId: 'n1', options: ['yes', 'no'], deadlineAt: 20 },
    { kind: 'refill', ...base, durable: false, target: 'effects', dueAt: 9, askedAt: 1 },
    { kind: 'breakpoint', ...base, durable: false },
  ];

  it('accept each kind', () => {
    for (const wait of waits) expect(WAIT.parse(wait)).toStrictEqual(wait);
  });

  it('reject an unknown kind and a missing due instant', () => {
    expect(WAIT.safeParse({ ...base, kind: 'later' }).success).toBe(false);
    expect(WAIT.safeParse({ kind: 'duration', ...base }).success).toBe(false);
  });

  it('are kept in the state', () => {
    for (const wait of waits) {
      const parked = state({ wait: WAIT.parse(wait) });
      expect(restoreRunState(serialiseRunState(parked))).toStrictEqual(parked);
    }
  });
});

describe('serialising', () => {
  it('restores the same state from its text', () => {
    const busy = state({
      frames: [
        {
          id: 'f0',
          kind: 'loop',
          path: 'body/0',
          pc: 1,
          locals: { item: { n: 1 } },
          outputs: {},
          loop: { index: 1, count: 3, items: [1, 2, 3], startedAt: 0, deadlineAt: 9_999 },
        },
      ],
    });
    expect(restoreRunState(serialiseRunState(busy))).toStrictEqual(busy);
  });

  it('refuses to write or read a state that is not valid', () => {
    expect(() => serialiseRunState(state({ seed: -1 }))).toThrow();
    expect(() => restoreRunState('{"runId":1}')).toThrow();
    expect(() => restoreRunState('not json')).toThrow();
  });
});
