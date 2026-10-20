import { z } from 'zod';
import { MOMENT } from '../api/primitives';
import { JSON_VALUE } from '../values';
import { ERROR_CLASS, UNCATCHABLE_ERROR_CLASSES, type ErrorClass } from './policy';

export const ERROR_RETRY_RULES = ['never', 'idempotent_only', 'per_node'] as const;

export type ErrorRetryRule = (typeof ERROR_RETRY_RULES)[number];

export interface ErrorClassFlags {
  readonly catchable: boolean;
  readonly retry: ErrorRetryRule;
}

const UNCATCHABLE: ReadonlySet<ErrorClass> = new Set(UNCATCHABLE_ERROR_CLASSES);

export function errorClassFlags(name: ErrorClass): ErrorClassFlags {
  let retry: ErrorRetryRule = 'never';
  if (name === 'Unreachable') retry = 'idempotent_only';
  if (name === 'Timeout') retry = 'per_node';
  return { catchable: !UNCATCHABLE.has(name), retry };
}

export function isCatchableErrorClass(name: ErrorClass): boolean {
  return errorClassFlags(name).catchable;
}

export function errorRetryRule(name: ErrorClass): ErrorRetryRule {
  return errorClassFlags(name).retry;
}

export const FLOW_ERROR = z.strictObject({
  class: ERROR_CLASS,
  message: z.string(),
  node: z.uuid(),
  path: z.string().min(1),
  attempt: z.int().min(1),
  at: MOMENT,
  get cause() {
    return FLOW_ERROR.optional();
  },
  detail: z.record(z.string(), JSON_VALUE).optional(),
});

export type FlowError = z.infer<typeof FLOW_ERROR>;
