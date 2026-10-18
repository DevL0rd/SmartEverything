import type { AiHarnessFailure } from '@smarteverything/domain';
import { PLAIN_ERROR } from '../model/failure-copy';

export type HarnessFailureAction =
  'open_computer' | 'choose_model' | 'choose_folder' | 'check_status';

export const HARNESS_FAILURE_ACTION_LABEL: Readonly<Record<HarnessFailureAction, string>> = {
  open_computer: 'Open computer',
  choose_model: 'Choose another model',
  choose_folder: 'Choose folder',
  check_status: 'Check status',
};

export interface HarnessFailureNames {
  readonly machine: string;
  readonly route: string | null;
  readonly folder: string | null;
  readonly reset: (at: string) => string;
}

export interface HarnessFailureCopy {
  readonly title: string;
  readonly body: string | null;
  readonly action: HarnessFailureAction | null;
}

type Row = (failure: AiHarnessFailure, names: HarnessFailureNames) => HarnessFailureCopy;

const withAction =
  (
    title: (failure: AiHarnessFailure, names: HarnessFailureNames) => string,
    action: HarnessFailureAction,
  ): Row =>
  (failure, names) => ({ title: title(failure, names), body: null, action });

const plainError: Row = () => ({ title: PLAIN_ERROR, body: null, action: null });

const routeOutage = withAction(
  (_failure, { route, machine }) => `${route ?? 'The model plan'} isn’t available on ${machine}`,
  'choose_model',
);

const unknownOutcome = withAction(() => 'The previous turn’s outcome is unknown', 'check_status');

const ROWS: Readonly<Record<AiHarnessFailure['code'], Row>> = {
  runtime_unavailable: withAction(
    (_failure, { machine }) => `The SmartEverything runtime on ${machine} isn’t running`,
    'open_computer',
  ),
  route_unavailable: routeOutage,
  subscription_unavailable: routeOutage,
  quota_exhausted: withAction(
    ({ retry_at }, { reset }) =>
      retry_at === null ? 'Plan limit reached' : `Plan limit reached · resets ${reset(retry_at)}`,
    'choose_model',
  ),
  directory_unavailable: withAction(
    (_failure, { folder }) =>
      folder === null ? 'The folder isn’t available' : `The folder ${folder} isn’t available`,
    'choose_folder',
  ),
  ownership_lost: plainError,
  source_outcome_unknown: unknownOutcome,
  capability_unsupported: plainError,
  composition_incompatible: plainError,
  operation_failed: plainError,
};

export function harnessFailureCopy(
  failure: AiHarnessFailure,
  names: HarnessFailureNames,
): HarnessFailureCopy {
  return ROWS[failure.code](failure, names);
}
