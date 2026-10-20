import fc from 'fast-check';
import { Builder } from './build';
import type { Site } from './build';
import { compiled } from './rig';
import type { Rig } from './rig';
import { blocks } from './shapes';
import type { Shape } from './shapes';

export interface Case {
  readonly rig: Rig;
  readonly seed: number;
}

function rigOf(main: readonly Shape[], callee: readonly Shape[]): Rig {
  const builder = new Builder();
  const entry: Site = { loops: [], calls: true, writes: true };
  const inner: Site = { loops: [], calls: false, writes: true };
  return {
    main: compiled(builder.scope(main, entry).nodes, 'automation'),
    callee: compiled(builder.scope(callee, inner).nodes, 'function'),
  };
}

export const cases: fc.Arbitrary<Case> = fc
  .tuple(blocks, blocks, fc.integer({ min: 0, max: 1000 }))
  .map(([main, callee, seed]) => ({ rig: rigOf(main, callee), seed }));
