import { LOOP_LIMIT } from '@smarteverything/domain';
import { z } from 'zod';
import type { Frame, NodeLowering, Reader } from './lower-effects';
import { effectFields } from './lower-effects';
import type { PlanOp } from './plan';
import type { LoopGap, LoopSource, LoopTest } from './plan-parts';
import { TEXT } from './plan-parts';

const ON_ERROR_SCOPE = 'onError';

function inner(read: Reader, loops: readonly string[] = read.low.frame.loops): Frame {
  return { loops, durable: read.low.frame.durable };
}

function body(read: Reader, name: string, frame: Frame = inner(read)): PlanOp {
  return read.low.scope(read.node.scopes?.[name], frame);
}

function optionalBody(read: Reader, name: string): PlanOp | undefined {
  return read.node.scopes?.[name] === undefined ? undefined : body(read, name);
}

const lowerIf: NodeLowering = (read) => ({
  op: 'branch',
  at: read.at,
  rows: (read.node.branches ?? []).map((row) => ({
    id: row.id,
    when: row.when,
    then: read.low.scope(row.scope, inner(read)),
  })),
  else: optionalBody(read, 'else'),
  outputs: read.node.outputs,
});

const lowerSwitch: NodeLowering = (read) => ({
  op: 'switch',
  at: read.at,
  subject: read.port('subject'),
  mode: read.fixed('mode', z.enum(['first', 'all']), 'first'),
  cases: (read.node.cases ?? []).map((row) => ({
    id: row.id,
    match: row.match,
    then: read.low.scope(row.scope, inner(read)),
  })),
  default: optionalBody(read, 'default'),
  outputs: read.node.outputs,
});

const lowerGuard: NodeLowering = (read) => ({
  op: 'guard',
  at: read.at,
  condition: read.port('condition'),
  quietly: read.fixed('quietly', z.boolean(), true),
});

const lowerParallel: NodeLowering = (read) => ({
  op: 'parallel',
  at: read.at,
  join: read.fixed('join', z.enum(['all', 'first', 'settled']), 'all'),
  errors: read.fixed('errors', z.enum(['failFast', 'settle']), 'failFast'),
  branches: Object.entries(read.node.scopes ?? {})
    .filter(([name]) => name !== ON_ERROR_SCOPE)
    .map(([name, scope]) => ({ name, body: read.low.scope(scope, inner(read, [])) })),
  outputs: read.node.outputs,
});

const lowerTry: NodeLowering = (read) => ({
  op: 'try',
  at: read.at,
  body: body(read, 'try'),
  catches: (read.node.catches ?? []).map((row) => ({
    id: row.id,
    classes: row.classes,
    then: read.low.scope(row.scope, inner(read)),
  })),
  finally: optionalBody(read, 'finally'),
  outputs: read.node.outputs,
});

const lowerWithEffect: NodeLowering = (read) => ({
  op: 'with_effect',
  ...effectFields(read),
  body: body(read, 'body', { loops: read.low.frame.loops, durable: false }),
});

const DURATION = z.int().min(0);

interface LoopParts {
  readonly source: LoopSource;
  readonly test?: LoopTest;
  readonly entryTest: boolean;
  readonly order: 'gap_then_test' | 'test_then_gap';
  readonly skipAfterLast: boolean;
}

function loopOp(read: Reader, parts: LoopParts): PlanOp {
  const limit = read.fixed('limit', LOOP_LIMIT.optional(), undefined);
  const gapMs = read.fixed('gap', DURATION, 0);
  const gap: LoopGap | undefined =
    gapMs > 0
      ? {
          ms: gapMs,
          skipAfterLast: parts.skipAfterLast,
          clipToDeadline: limit?.time !== undefined,
        }
      : undefined;
  return {
    op: 'loop',
    at: read.at,
    source: parts.source,
    test: parts.test,
    entryTest: parts.entryTest,
    order: parts.order,
    gap,
    limit,
    body: body(read, 'body', inner(read, [...read.low.frame.loops, read.node.key])),
  };
}

const lowerForEach: NodeLowering = (read) =>
  loopOp(read, {
    source: {
      kind: 'items',
      items: read.port('items'),
      concurrency: read.fixed('concurrency', z.int().min(1), 1),
      reverse: read.fixed('reverse', z.boolean(), false),
      collect: read.maybe('collect'),
    },
    entryTest: false,
    order: 'gap_then_test',
    skipAfterLast: false,
  });

const lowerRepeat: NodeLowering = (read) =>
  loopOp(read, {
    source: { kind: 'count', times: read.port('times') },
    entryTest: false,
    order: 'gap_then_test',
    skipAfterLast: true,
  });

const lowerForRange: NodeLowering = (read) =>
  loopOp(read, {
    source: {
      kind: 'range',
      from: read.port('from'),
      to: read.port('to'),
      step: read.port('step'),
    },
    entryTest: false,
    order: 'gap_then_test',
    skipAfterLast: false,
  });

const lowerWhile: NodeLowering = (read) =>
  loopOp(read, {
    source: { kind: 'open' },
    test: { when: read.port('condition'), stopWhen: false },
    entryTest: true,
    order: 'gap_then_test',
    skipAfterLast: false,
  });

const lowerDoUntil: NodeLowering = (read) =>
  loopOp(read, {
    source: { kind: 'open' },
    test: { when: read.port('condition'), stopWhen: true },
    entryTest: false,
    order: 'test_then_gap',
    skipAfterLast: false,
  });

const lowerForever: NodeLowering = (read) =>
  loopOp(read, {
    source: { kind: 'open' },
    entryTest: false,
    order: 'gap_then_test',
    skipAfterLast: false,
  });

const lowerSequence: NodeLowering = (read) => body(read, 'body');

function loopTarget(read: Reader): string {
  const { loops } = read.low.frame;
  const named = read.fixed('target', TEXT.optional(), undefined);
  const innermost = loops.at(-1);
  if (innermost === undefined) {
    read.problem('break_outside_loop', `${read.node.kind} is only valid inside a loop`, {
      fix: 'move it into the body of a loop',
    });
    return '';
  }
  if (named === undefined) return innermost;
  if (!loops.includes(named)) {
    read.problem('unknown_loop', `"${named}" is not a loop around this step`, {
      port: 'target',
      received: named,
      expected: loops.join(', '),
    });
  }
  return named;
}

const lowerBreak: NodeLowering = (read) => ({
  op: 'break',
  at: read.at,
  target: loopTarget(read),
});

const lowerContinue: NodeLowering = (read) => ({
  op: 'continue',
  at: read.at,
  target: loopTarget(read),
});

export const CONTROL_LOWERING: Readonly<Record<string, NodeLowering>> = {
  'flow.if': lowerIf,
  'flow.switch': lowerSwitch,
  'flow.guard': lowerGuard,
  'flow.for_each': lowerForEach,
  'flow.repeat': lowerRepeat,
  'flow.for_range': lowerForRange,
  'flow.while': lowerWhile,
  'flow.do_until': lowerDoUntil,
  'flow.forever': lowerForever,
  'flow.sequence': lowerSequence,
  'flow.break': lowerBreak,
  'flow.continue': lowerContinue,
  'flow.parallel': lowerParallel,
  'flow.try': lowerTry,
  'device.set_temporarily': lowerWithEffect,
};
