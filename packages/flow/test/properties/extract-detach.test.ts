import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { detachInstance } from '../../src/extract/detach';
import { extractRegion } from '../../src/extract/extract';
import type { Extraction } from '../../src/extract/extract';
import type { Program } from '../../src/program/walk';
import { Builder } from '../arbitraries/build';
import { CALLEE_ID, VARIABLES, compileProgram, runToEnd } from '../arbitraries/rig';
import type { Finished, Rig } from '../arbitraries/rig';
import { blocks } from '../arbitraries/shapes';
import type { Shape } from '../arbitraries/shapes';
import { automation, trigger } from '../check/c23-support';
import { CTX, newId } from '../extract/support';
import { LONG, RUNS } from './support';

const loopOf = (count: number, gap: number, withWait: boolean): Shape => ({
  t: 'loop',
  kind: 'repeat',
  count,
  gap,
  limit: 'none',
  onLimit: 'end',
  concurrency: 1,
  bump: false,
  body: [
    { t: 'effect' },
    ...(withWait ? [{ t: 'wait', kind: 'duration', ms: 5, goal: 0 } as const] : []),
  ],
});

const simple = fc.array(
  fc.oneof(
    fc.constant<Shape>({ t: 'effect' }),
    fc
      .integer({ min: 1, max: 200 })
      .map((ms): Shape => ({ t: 'wait', kind: 'duration', ms, goal: 0 })),
    fc
      .tuple(fc.integer({ min: 0, max: 3 }), fc.constantFrom(0, 20), fc.boolean())
      .map(([count, gap, withWait]) => loopOf(count, gap, withWait)),
  ),
  { minLength: 2, maxLength: 6 },
);

function reads(shape: Shape): boolean {
  if (shape.t === 'wait') return shape.kind === 'condition';
  if (shape.t === 'loop') return shape.kind === 'while' || shape.kind === 'until';
  return shape.t === 'if';
}

const NESTED: Partial<Record<Shape['t'], (shape: Shape) => readonly Shape[]>> = {
  loop: (shape) => (shape.t === 'loop' ? shape.body : []),
  parallel: (shape) => (shape.t === 'parallel' ? shape.branches.flat() : []),
  try: (shape) => (shape.t === 'try' ? [...shape.body, ...shape.cleanup] : []),
};

function inside(shape: Shape): readonly Shape[] {
  return NESTED[shape.t]?.(shape) ?? [];
}

function readsVariables(shape: Shape): boolean {
  return reads(shape) || inside(shape).some(readsVariables);
}

const ONLY_REGION_SAFE: ReadonlySet<string> = new Set([
  'effect',
  'wait',
  'fail',
  'loop',
  'parallel',
  'try',
]);

const readFree = blocks.map((shapes) =>
  shapes.filter((shape) => ONLY_REGION_SAFE.has(shape.t) && !readsVariables(shape)),
);

const readers = blocks.map((shapes) =>
  shapes.filter((shape) => ONLY_REGION_SAFE.has(shape.t) || shape.t === 'if'),
);

function programOf(shapes: readonly Shape[]): Program {
  const nodes = new Builder().scope(shapes, { loops: [], calls: false, writes: false }).nodes;
  const press = trigger('press', 'trigger.signal', {
    source: { lit: 'home' },
    kind: { lit: 'tick' },
  });
  return { ...automation(nodes), triggers: [press], variables: VARIABLES };
}

function view(finished: Finished): unknown {
  return {
    ending: finished.ending,
    nodes: finished.journal.nodes,
    parks: finished.journal.parks.map((wait) => [wait.kind, 'dueAt' in wait ? wait.dueAt : 0]),
    now: finished.now,
  };
}

function plain(program: Program): Rig {
  const main = compileProgram(program);
  return { main, callee: main };
}

function calling(result: Extraction): Rig {
  const { callee, caller } = result;
  return {
    main: compileProgram(caller),
    callee: compileProgram(callee),
    shape: { inputs: callee.inputs, outputs: callee.outputs, exits: callee.exits },
  };
}

function extractedFrom(program: Program, selection: readonly string[]): Extraction | undefined {
  const result = extractRegion(program, selection, CTX, {
    functionId: CALLEE_ID,
    name: 'Region',
    newId,
  });
  return result.ok ? result : undefined;
}

describe('extract then detach', () => {
  it(
    'keeps the behaviour of the program at both steps',
    () => {
      let extracted = 0;
      fc.assert(
        fc.property(simple, fc.nat(10), fc.nat(10), fc.nat(1000), (shapes, from, span, seed) => {
          const program = programOf(shapes);
          const keys = program.body.nodes.map((node) => node.key);
          const first = from % keys.length;
          const last = Math.min(keys.length - 1, first + 1 + (span % keys.length));
          const result = extractedFrom(program, keys.slice(first, last + 1));
          if (result === undefined) return;
          const original = view(runToEnd(plain(program), seed));
          expect(view(runToEnd(calling(result), seed))).toEqual(original);
          const back = detachInstance(result.caller, result.instanceKey, result.callee, { newId });
          if (!back.ok) throw new Error(`detach refused: ${back.reason}`);
          expect(view(runToEnd(plain(back.program), seed))).toEqual(original);
          extracted += 1;
        }),
        { numRuns: RUNS },
      );
      expect(extracted).toBeGreaterThan(0);
    },
    LONG,
  );

  it(
    'also keeps the behaviour of regions with tries, parallel lanes and failures',
    () => {
      let extracted = 0;
      fc.assert(
        fc.property(readFree, fc.nat(1000), (shapes, seed) => {
          const program = programOf(shapes);
          const keys = program.body.nodes.map((node) => node.key);
          if (keys.length < 2) return;
          const result = extractedFrom(program, keys.slice(0, 2));
          if (result === undefined) return;
          const original = runToEnd(plain(program), seed);
          const after = runToEnd(calling(result), seed);
          expect(after.ending).toEqual(original.ending);
          expect(after.journal.nodes).toEqual(original.journal.nodes);
          extracted += 1;
        }),
        { numRuns: RUNS },
      );
      expect(extracted).toBeGreaterThan(0);
    },
    LONG,
  );

  it(
    'keeps the behaviour of regions that read run variables',
    () => {
      let extracted = 0;
      fc.assert(
        fc.property(readers, fc.nat(1000), (shapes, seed) => {
          const program = programOf(shapes);
          const keys = program.body.nodes.map((node) => node.key);
          if (keys.length < 2) return;
          const result = extractedFrom(program, keys);
          if (result === undefined) return;
          const original = runToEnd(plain(program), seed);
          const after = runToEnd(calling(result), seed);
          expect(after.ending).toEqual(original.ending);
          expect(after.journal.nodes).toEqual(original.journal.nodes);
          const back = detachInstance(result.caller, result.instanceKey, result.callee, { newId });
          if (!back.ok) throw new Error(`detach refused: ${back.reason}`);
          expect(runToEnd(plain(back.program), seed).journal.nodes).toEqual(original.journal.nodes);
          extracted += 1;
        }),
        { numRuns: RUNS },
      );
      expect(extracted).toBeGreaterThan(0);
    },
    LONG,
  );

  it('keeps the behaviour of a region that reads a run variable', () => {
    const program = programOf([
      { t: 'wait', kind: 'duration', ms: 5, goal: 0 },
      { t: 'if', goal: 0, then: [{ t: 'effect' }], otherwise: [] },
    ]);
    const keys = program.body.nodes.map((node) => node.key);
    const result = extractedFrom(program, keys);
    if (result === undefined) throw new Error('the region was refused');
    const original = runToEnd(plain(program), 1);
    expect(runToEnd(calling(result), 1).journal.nodes).toEqual(original.journal.nodes);
  });
});
