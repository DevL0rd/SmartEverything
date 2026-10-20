import { describe, expect, it } from 'vitest';
import {
  bump,
  counter,
  doUntil,
  drive,
  effect,
  wired,
  gap,
  limit,
  loopContext,
  lit,
  planOf,
  repeat,
  seq,
  stateOf,
  whileLoop,
} from './loops-support';
import { compute } from './core-support';

type Kind = 'times' | 'while' | 'until';

interface Spec {
  readonly kind: Kind;
  readonly times: number;
  readonly gapMs: number;
  readonly limitMs: number;
  readonly bodyMs: number;
}

interface Observed {
  readonly starts: number[];
  readonly endedAt: number;
  readonly limited: boolean;
}

const NOTE = 'The repeat reached its time limit and stopped.';

function v2(spec: Spec): Observed {
  const starts: number[] = [];
  let now = 0;
  for (let turn = 0; ; turn += 1) {
    if (now >= spec.limitMs) return { starts, endedAt: spec.limitMs, limited: true };
    const enters = spec.kind === 'while' || turn < spec.times;
    if (!enters || (spec.kind === 'while' && turn >= spec.times)) {
      return { starts, endedAt: now, limited: false };
    }
    starts.push(now);
    if (now + spec.bodyMs > spec.limitMs) {
      return { starts, endedAt: spec.limitMs, limited: true };
    }
    now += spec.bodyMs;
    if (spec.kind !== 'while' && turn + 1 >= spec.times) {
      return { starts, endedAt: now, limited: false };
    }
    now += Math.min(spec.gapMs, Math.max(0, spec.limitMs - now));
  }
}

function v3(spec: Spec): Observed {
  const body = seq(effect('work'), bump());
  const options = {
    gap: spec.gapMs === 0 ? undefined : gap(spec.gapMs, spec.kind === 'times'),
    limit: limit({ time: spec.limitMs, note: NOTE }),
  };
  const op =
    spec.kind === 'times'
      ? repeat('lp', lit(spec.times), body, options)
      : spec.kind === 'while'
        ? whileLoop('lp', wired('below.result'), body, options)
        : doUntil('lp', wired('reached.result'), body, options);
  const tests = [
    compute('below', 'logic.compare', { a: wired('vars.i'), op: lit('lt'), b: lit(spec.times) }),
    compute('reached', 'logic.compare', { a: wired('vars.i'), op: lit('gte'), b: lit(spec.times) }),
  ];
  const plan = planOf(seq(op, ...tests), { variables: counter() });
  const driven = drive(loopContext(plan), stateOf(), { work: spec.bodyMs });
  expect(driven.outcome.kind).toBe('done');
  const note = driven.records.find((record) => record.kind === 'note');
  return {
    starts: driven.requests.map((request) => request.at),
    endedAt: driven.now,
    limited: note?.kind === 'note' && note.message === NOTE,
  };
}

const KINDS: readonly Kind[] = ['times', 'while', 'until'];

const CASES = KINDS.flatMap((kind) => [
  { kind, times: 4, gapMs: 0, limitMs: 100_000, bodyMs: 300 },
  { kind, times: 4, gapMs: 0, limitMs: 700, bodyMs: 300 },
  { kind, times: 4, gapMs: 0, limitMs: 1000, bodyMs: 300 },
  { kind, times: 4, gapMs: 1000, limitMs: 100_000, bodyMs: 300 },
  { kind, times: 4, gapMs: 1000, limitMs: 1500, bodyMs: 300 },
  { kind, times: 4, gapMs: 1000, limitMs: 1100, bodyMs: 300 },
  { kind, times: 4, gapMs: 1000, limitMs: 2000, bodyMs: 300 },
  { kind, times: 1, gapMs: 1000, limitMs: 100_000, bodyMs: 300 },
]);

describe('loop timing against the V2 repeat step', () => {
  it.each(CASES)('$kind x$times gap $gapMs limit $limitMs body $bodyMs', (spec) => {
    expect(v3(spec)).toEqual(v2(spec));
  });

  it('keeps the exact timeline of a gapped times loop', () => {
    const observed = v3({ kind: 'times', times: 3, gapMs: 1000, limitMs: 100_000, bodyMs: 300 });
    expect(observed).toEqual({ starts: [0, 1300, 2600], endedAt: 2900, limited: false });
  });

  it('keeps the exact timeline of a gapped while loop that waits after every pass', () => {
    const observed = v3({ kind: 'while', times: 3, gapMs: 1000, limitMs: 100_000, bodyMs: 300 });
    expect(observed).toEqual({ starts: [0, 1300, 2600], endedAt: 3900, limited: false });
  });

  it('keeps the exact timeline of a gapped do until that skips the gap once true', () => {
    const observed = v3({ kind: 'until', times: 3, gapMs: 1000, limitMs: 100_000, bodyMs: 300 });
    expect(observed).toEqual({ starts: [0, 1300, 2600], endedAt: 2900, limited: false });
  });
});
