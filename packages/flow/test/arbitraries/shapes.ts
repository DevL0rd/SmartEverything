import type { ErrorClass } from '@smarteverything/domain';
import fc from 'fast-check';

type WaitKind = 'duration' | 'until' | 'event' | 'condition';

export type LoopKind = 'repeat' | 'while' | 'until' | 'each' | 'range';

export type Leaf =
  | { readonly t: 'effect' }
  | { readonly t: 'bump' }
  | { readonly t: 'call' }
  | { readonly t: 'break' }
  | { readonly t: 'continue' }
  | { readonly t: 'fail'; readonly errorClass: ErrorClass }
  | { readonly t: 'wait'; readonly kind: WaitKind; readonly ms: number; readonly goal: number };

export interface Branching {
  readonly t: 'if';
  readonly goal: number;
  readonly then: readonly Shape[];
  readonly otherwise: readonly Shape[];
}

export interface Looping {
  readonly t: 'loop';
  readonly kind: LoopKind;
  readonly count: number;
  readonly gap: number;
  readonly limit: 'none' | 'iterations' | 'time';
  readonly onLimit: 'fail' | 'end';
  readonly concurrency: number;
  readonly bump: boolean;
  readonly body: readonly Shape[];
}

export interface Forking {
  readonly t: 'parallel';
  readonly join: 'all' | 'first' | 'settled';
  readonly errors: 'failFast' | 'settle';
  readonly branches: readonly (readonly Shape[])[];
}

export interface Guarding {
  readonly t: 'try';
  readonly body: readonly Shape[];
  readonly catches: boolean;
  readonly cleanup: readonly Shape[];
}

export type Compound = Branching | Looping | Forking | Guarding;

export type Shape = Leaf | Compound;

const FAILURES: readonly ErrorClass[] = [
  'Refused',
  'Unreachable',
  'Timeout',
  'Failed',
  'Invalid',
  'BudgetExceeded',
];

const LEAF_ARB: fc.Arbitrary<Leaf> = fc.oneof(
  fc.constant<Leaf>({ t: 'effect' }),
  fc.constant<Leaf>({ t: 'bump' }),
  fc.constant<Leaf>({ t: 'call' }),
  fc.constant<Leaf>({ t: 'break' }),
  fc.constant<Leaf>({ t: 'continue' }),
  fc.constantFrom(...FAILURES).map((errorClass): Leaf => ({ t: 'fail', errorClass })),
  fc
    .record({
      kind: fc.constantFrom<WaitKind>('duration', 'until', 'event', 'condition'),
      ms: fc.integer({ min: 1, max: 300 }),
      goal: fc.integer({ min: 0, max: 4 }),
    })
    .map((wait): Leaf => ({ t: 'wait', ...wait })),
);

type Block = fc.Arbitrary<readonly Shape[]>;

const goals = fc.integer({ min: 0, max: 4 });

function branching(block: Block): fc.Arbitrary<Shape> {
  return fc
    .record({ goal: goals, then: block, otherwise: block })
    .map((row): Shape => ({ t: 'if', ...row }));
}

function looping(block: Block): fc.Arbitrary<Shape> {
  return fc
    .record({
      kind: fc.constantFrom<LoopKind>('repeat', 'while', 'until', 'each', 'range'),
      count: fc.integer({ min: 0, max: 5 }),
      gap: fc.constantFrom(0, 0, 20, 150),
      limit: fc.constantFrom<'none' | 'iterations' | 'time'>('none', 'iterations', 'time'),
      onLimit: fc.constantFrom<'fail' | 'end'>('fail', 'end'),
      concurrency: fc.constantFrom(1, 1, 2, 3),
      bump: fc.boolean(),
      body: block,
    })
    .map((row): Shape => ({ t: 'loop', ...row }));
}

function forking(block: Block): fc.Arbitrary<Shape> {
  return fc
    .record({
      join: fc.constantFrom<'all' | 'first' | 'settled'>('all', 'first', 'settled'),
      errors: fc.constantFrom<'failFast' | 'settle'>('failFast', 'settle'),
      branches: fc.array(block, { minLength: 2, maxLength: 3 }),
    })
    .map((row): Shape => ({ t: 'parallel', ...row }));
}

function guarding(block: Block): fc.Arbitrary<Shape> {
  return fc
    .record({ body: block, catches: fc.boolean(), cleanup: block })
    .map((row): Shape => ({ t: 'try', ...row }));
}

export const blocks: Block = fc.letrec<{ block: readonly Shape[]; stmt: Shape }>((tie) => {
  const block = tie('block');
  return {
    block: fc.array(tie('stmt'), { maxLength: 3 }),
    stmt: fc.oneof(
      { arbitrary: LEAF_ARB, weight: 6 },
      { arbitrary: branching(block), weight: 1 },
      { arbitrary: looping(block), weight: 2 },
      { arbitrary: forking(block), weight: 1 },
      { arbitrary: guarding(block), weight: 1 },
    ),
  };
}).block;
