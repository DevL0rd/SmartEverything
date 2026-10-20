import type { PureEvaluator } from '../../interpret/frames';
import { DATE_BODIES } from './dates';
import { DATE_MORE_BODIES } from './dates-more';
import { LIST_BODIES } from './lists';
import { LIST_MORE_BODIES } from './lists-more';
import { LOGIC_BODIES } from './logic';
import { LOGIC_MORE_BODIES } from './logic-more';
import { MATH_BODIES } from './math';
import { MATH_MORE_BODIES } from './math-more';
import { OBJECT_BODIES } from './objects';
import { OBJECT_MORE_BODIES } from './objects-more';
import type { PureBodies, PureEnvironment } from './support';
import { evaluatorOf } from './support';
import { TEXT_BODIES } from './text';
import { TEXT_MORE_BODIES } from './text-more';
import { UTIL_BODIES } from './util';

export type { PureEnvironment } from './support';

export const PURE_BODIES: PureBodies = {
  ...LOGIC_BODIES,
  ...LOGIC_MORE_BODIES,
  ...MATH_BODIES,
  ...MATH_MORE_BODIES,
  ...TEXT_BODIES,
  ...TEXT_MORE_BODIES,
  ...LIST_BODIES,
  ...LIST_MORE_BODIES,
  ...OBJECT_BODIES,
  ...OBJECT_MORE_BODIES,
  ...DATE_BODIES,
  ...DATE_MORE_BODIES,
  ...UTIL_BODIES,
};

export function pureEvaluators(
  environment: PureEnvironment,
): (kind: string) => PureEvaluator | undefined {
  const evaluators = new Map(
    Object.entries(PURE_BODIES).map(([kind, body]) => [kind, evaluatorOf(body, environment)]),
  );
  return (kind) => evaluators.get(kind);
}
