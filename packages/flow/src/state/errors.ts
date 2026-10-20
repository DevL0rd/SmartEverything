import { ERROR_CLASS, ERROR_CLASSES, isCatchableErrorClass } from '@smarteverything/domain';
import type { ErrorClass, FlowError, JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { Breach } from './budgets';
import { breachClass } from './budgets';

export interface ErrorSite {
  readonly node: string;
  readonly path: string;
  readonly at: number;
  readonly attempt?: number | undefined;
}

export interface ErrorExtras {
  readonly cause?: FlowError | undefined;
  readonly detail?: Record<string, JsonValue> | undefined;
}

export type ErrorBuilder = (message: string, site: ErrorSite, extras?: ErrorExtras) => FlowError;

export function flowError(
  errorClass: ErrorClass,
  message: string,
  site: ErrorSite,
  extras: ErrorExtras = {},
): FlowError {
  return {
    class: errorClass,
    message,
    node: site.node,
    path: site.path,
    attempt: site.attempt ?? 1,
    at: new Date(site.at).toISOString(),
    ...(extras.cause === undefined ? {} : { cause: extras.cause }),
    ...(extras.detail === undefined ? {} : { detail: extras.detail }),
  };
}

function builder(errorClass: ErrorClass): ErrorBuilder {
  return (message, site, extras) => flowError(errorClass, message, site, extras);
}

export const FLOW_ERRORS: Readonly<Record<ErrorClass, ErrorBuilder>> = {
  Refused: builder('Refused'),
  Unreachable: builder('Unreachable'),
  Timeout: builder('Timeout'),
  Unknown: builder('Unknown'),
  TypeError: builder('TypeError'),
  MathError: builder('MathError'),
  Invalid: builder('Invalid'),
  NotFound: builder('NotFound'),
  Forbidden: builder('Forbidden'),
  LimitExceeded: builder('LimitExceeded'),
  Failed: builder('Failed'),
  BudgetExceeded: builder('BudgetExceeded'),
  Cancelled: builder('Cancelled'),
};

export const CATCHABLE: Readonly<Record<ErrorClass, boolean>> = z
  .record(ERROR_CLASS, z.boolean())
  .parse(Object.fromEntries(ERROR_CLASSES.map((name) => [name, isCatchableErrorClass(name)])));

export function isCatchable(error: Pick<FlowError, 'class'>): boolean {
  return CATCHABLE[error.class];
}

export function breachError(
  breach: Breach,
  site: ErrorSite,
  runId: string,
  extras: ErrorExtras = {},
): FlowError {
  return flowError(
    breachClass(breach.budget),
    `${breach.budget} limit ${String(breach.limit)} exceeded (${String(breach.used)})`,
    site,
    {
      ...extras,
      detail: {
        ...extras.detail,
        budget: breach.budget,
        limit: breach.limit,
        used: breach.used,
        nodePath: site.path,
        runId,
      },
    },
  );
}
