import {
  WEATHER_METRIC_INFO,
  type ConditionV2,
  type TestV2,
  type TriggerTestV2,
} from '@smarteverything/domain';
import { valueOperators, type TestOperator } from './capability-choices';
import { defaultFor, type LiteralShape } from './inputs';

export type GroupMode = 'all' | 'any';

interface RootGroup {
  readonly mode: GroupMode;
  readonly items: readonly ConditionV2[];
}

export function rootGroup(condition: ConditionV2 | undefined): RootGroup {
  if (condition === undefined) return { mode: 'all', items: [] };
  if ('all' in condition) return { mode: 'all', items: condition.all };
  return 'any' in condition
    ? { mode: 'any', items: condition.any }
    : { mode: 'all', items: [condition] };
}

export function conditionOfGroup(group: RootGroup): ConditionV2 | undefined {
  if (group.items.length === 0) return undefined;
  return group.mode === 'any' ? { any: [...group.items] } : { all: [...group.items] };
}

const NUMERIC_OPERATORS: readonly TestOperator[] = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
];
const EQUALITY_OPERATORS: readonly TestOperator[] = ['eq', 'ne'];
const WEATHER_OPERATORS: readonly TestOperator[] = ['gt', 'gte', 'lt', 'lte', 'between'];

export function isCompareTest(test: TriggerTestV2): test is TestV2 {
  return test.is !== 'changed';
}

export function compareOperators(shape: LiteralShape): readonly TestOperator[] {
  if (shape.type === 'reading') return valueOperators(shape.capability.value);
  if (shape.type === 'weather') return WEATHER_OPERATORS;
  return shape.kind === 'number' || shape.kind === 'duration'
    ? NUMERIC_OPERATORS
    : EQUALITY_OPERATORS;
}

export function defaultCompareTest(shape: LiteralShape | null): TestV2 {
  if (shape === null) return { is: 'eq', to: '' };
  if (shape.type === 'weather') return { is: 'gt', to: WEATHER_METRIC_INFO[shape.metric].min };
  if (shape.type === 'reading' && shape.capability.value.kind === 'number')
    return { is: 'gt', to: shape.capability.value.min };
  if (shape.type === 'kind' && (shape.kind === 'number' || shape.kind === 'duration'))
    return { is: 'gt', to: 0 };
  return { is: 'eq', to: defaultFor(shape) };
}
