import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import type { WaitSpec } from '../../src/compile/plan-parts';
import type { Outcome, StepEvent } from '../../src/interpret/frames';
import { step } from '../../src/interpret/step';
import { resumeResult, wakeAt, wakeResume, waitOps } from '../../src/interpret/waits';
import type { WaitResume } from '../../src/interpret/waits';
import { RUN_STATE } from '../../src/state/run-state';
import type { RunState, Wait } from '../../src/state/run-state';
import { NOW, at, contextOf, effect, lit, planOf, seq, stateOf } from './core-support';

const MINUTE = 60_000;

type AskSpec = Extract<WaitSpec, { kind: 'answer' }>;

function askSpec(extra: Partial<AskSpec> = {}): AskSpec {
  return {
    kind: 'answer',
    person: lit('person-1'),
    question: lit('Lock the door?'),
    options: ['Yes', 'No'],
    ...extra,
  };
}

function askNode(spec: AskSpec, scopes?: Record<string, PlanOp>): PlanOp {
  return {
    op: 'wait',
    at: at('ask'),
    durable: true,
    wait: spec,
    ...(scopes === undefined ? {} : { scopes }),
  };
}

function contextFor(body: PlanOp): ReturnType<typeof contextOf> {
  const base = contextOf(planOf(body));
  return {
    ...base,
    ops: { ...base.ops, ...waitOps({ nextOccurrence: () => ({ ok: true, value: NOW }) }) },
  };
}

interface Reached {
  readonly outcome: Outcome;
  readonly state: RunState;
  readonly effects: string[];
  readonly params: unknown[];
}

function drive(
  ctx: ReturnType<typeof contextFor>,
  from: RunState,
  first: StepEvent,
  now: number = NOW,
): Reached {
  const effects: string[] = [];
  const params: unknown[] = [];
  let state = from;
  let event = first;
  for (let steps = 0; steps < 100; steps += 1) {
    const stepped = step(ctx, state, event);
    RUN_STATE.parse(JSON.parse(JSON.stringify(stepped.state)));
    state = stepped.state;
    const { outcome } = stepped;
    if (outcome.kind === 'effect' && outcome.request.kind === 'test.effect') {
      effects.push(outcome.request.node.key);
      event = { kind: 'resolved', now, result: { ok: true, value: {} } };
      continue;
    }
    if (outcome.kind === 'effect') {
      effects.push(outcome.request.kind);
      params.push(outcome.request.params);
      return { outcome, state, effects, params };
    }
    if (outcome.kind !== 'continue') return { outcome, state, effects, params };
    event = { kind: 'run', now };
  }
  throw new Error('the run did not stop');
}

function asked(body: PlanOp): { ctx: ReturnType<typeof contextFor>; request: Reached } {
  const ctx = contextFor(body);
  return { ctx, request: drive(ctx, stateOf(), { kind: 'start', now: NOW }) };
}

function parked(ctx: ReturnType<typeof contextFor>, from: Reached, id = 'note-1'): Reached {
  return drive(ctx, from.state, {
    kind: 'resolved',
    now: NOW,
    result: { ok: true, value: { notificationId: id } },
  });
}

function waitOf(reached: Reached): Wait {
  if (reached.outcome.kind !== 'park')
    throw new Error(`expected a park, got ${reached.outcome.kind}`);
  return reached.outcome.wait;
}

function resumed(
  ctx: ReturnType<typeof contextFor>,
  from: Reached,
  resume: WaitResume,
  now: number = NOW,
): Reached {
  return drive(
    ctx,
    from.state,
    { kind: 'resolved', now, result: resumeResult(waitOf(from), resume) },
    now,
  );
}

function outputsOf(reached: Reached): unknown {
  return reached.state.frames[0]?.outputs['ask'];
}

describe('ask and wait', () => {
  it('sends the question first and parks on the answer once it is sent', () => {
    const { ctx, request } = asked(seq(askNode(askSpec({ timeoutMs: 30 * MINUTE }))));
    expect(request.effects).toEqual(['notify.ask']);
    expect(request.params).toEqual([
      {
        person: 'person-1',
        question: 'Lock the door?',
        options: ['Yes', 'No'],
        timeout: 30 * MINUTE,
      },
    ]);
    const waiting = parked(ctx, request);
    expect(waitOf(waiting)).toEqual({
      kind: 'answer',
      nodePath: 'body/ops/0',
      durable: true,
      notificationId: 'note-1',
      options: ['Yes', 'No'],
      deadlineAt: NOW + 30 * MINUTE,
    });
    expect(waiting.state.wait).toEqual(waitOf(waiting));
  });

  it('continues with the answer and who gave it', () => {
    const { ctx, request } = asked(seq(askNode(askSpec()), effect('after')));
    const answered = resumed(ctx, parked(ctx, request), {
      kind: 'answer',
      answer: 'Yes',
      by: 'p1',
    });
    expect(answered.effects).toEqual(['after']);
    expect(outputsOf(answered)).toEqual({ answer: 'Yes', by: 'p1', timedOut: false });
    expect(answered.state.wait).toBeUndefined();
  });

  it('refuses an answer that is not one of the buttons', () => {
    const { ctx, request } = asked(seq(askNode(askSpec()), effect('after')));
    const refused = resumed(ctx, parked(ctx, request), { kind: 'answer', answer: 'Maybe' });
    expect(refused.outcome).toMatchObject({ kind: 'failed', error: { class: 'Invalid' } });
    expect(refused.effects).toEqual([]);
  });

  it('uses the answer given for a time out and says it timed out', () => {
    const spec = askSpec({ timeoutMs: MINUTE, defaultAnswer: 'No' });
    const { ctx, request } = asked(seq(askNode(spec), effect('after')));
    const late = resumed(ctx, parked(ctx, request), { kind: 'timeout' }, NOW + MINUTE);
    expect(late.effects).toEqual(['after']);
    expect(outputsOf(late)).toEqual({ answer: 'No', timedOut: true });
  });

  it('leaves the answer out and goes on when time runs out without a default or lane', () => {
    const { ctx, request } = asked(seq(askNode(askSpec({ timeoutMs: MINUTE })), effect('after')));
    const late = resumed(ctx, parked(ctx, request), { kind: 'timeout' }, NOW + MINUTE);
    expect(late.effects).toEqual(['after']);
    expect(outputsOf(late)).toEqual({ timedOut: true });
  });

  it('runs the timed out lane before going on when one is connected', () => {
    const lane = seq(effect('gaveUp'));
    const spec = askSpec({ timeoutMs: MINUTE });
    const { ctx, request } = asked(seq(askNode(spec, { timedOut: lane }), effect('after')));
    const late = resumed(ctx, parked(ctx, request), { kind: 'timeout' }, NOW + MINUTE);
    expect(late.effects).toEqual(['gaveUp', 'after']);
  });

  it('does not run the timed out lane when someone answers', () => {
    const lane = seq(effect('gaveUp'));
    const { ctx, request } = asked(seq(askNode(askSpec(), { timedOut: lane }), effect('after')));
    const answered = resumed(ctx, parked(ctx, request), { kind: 'answer', answer: 'No' });
    expect(answered.effects).toEqual(['after']);
  });

  it('fails the run when the question could not be sent', () => {
    const { ctx, request } = asked(seq(askNode(askSpec())));
    const failed = drive(ctx, request.state, {
      kind: 'resolved',
      now: NOW,
      result: { ok: false, class: 'Unreachable', message: 'nobody to tell' },
    });
    expect(failed.outcome).toMatchObject({ kind: 'failed', error: { class: 'Unreachable' } });
  });

  it('wakes at the deadline with a time out and waits for ever without one', () => {
    const timedRun = asked(seq(askNode(askSpec({ timeoutMs: MINUTE }))));
    const timed = waitOf(parked(timedRun.ctx, timedRun.request));
    expect(wakeAt(timed)).toBe(NOW + MINUTE);
    if (timed.kind !== 'answer') throw new Error('not an answer wait');
    expect(wakeResume(timed, NOW + MINUTE, false)).toEqual({ kind: 'timeout' });
    expect(wakeResume(timed, NOW + 1, false)).toBeUndefined();
    const openRun = asked(seq(askNode(askSpec())));
    expect(wakeAt(waitOf(parked(openRun.ctx, openRun.request)))).toBeUndefined();
  });
});
