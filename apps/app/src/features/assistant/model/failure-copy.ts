import type { AssistantReasonCode } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type FailureAction = 'continue' | 'choose_model' | 'machine_switch' | 'top_up' | 'details';

export type FailureTone = 'critical' | 'warning' | 'variant';

export interface FailureContext {
  readonly model: string | null;
  readonly reason: string | null;
  readonly native?: boolean;
}

export interface FailureCopy {
  readonly tone: FailureTone;
  readonly icon: IconName;
  readonly title: string;
  readonly detail: string | null;
  readonly actions: readonly FailureAction[];
}

const MODEL_FALLBACK = 'The model';

export const PLAIN_ERROR = 'An error occurred.';

interface Names {
  readonly model: string;
}

type Row = (names: Names, context: FailureContext) => FailureCopy;

type Line = Omit<FailureCopy, 'detail'>;

function withDetail(line: Line, detail: string | null): FailureCopy {
  return {
    ...line,
    detail,
    actions: detail === null ? line.actions : [...line.actions, 'details'],
  };
}

function critical(title: string, actions: readonly FailureAction[]): FailureCopy {
  return withDetail({ tone: 'critical', icon: 'alert', title, actions }, null);
}

const ROWS: Readonly<Record<AssistantReasonCode, Row>> = {
  credits: () => critical('Out of OpenRouter credits.', ['top_up', 'choose_model']),
  rate_limit: () =>
    withDetail(
      {
        tone: 'warning',
        icon: 'clock',
        title: 'The model is rate limited.',
        actions: ['continue', 'choose_model'],
      },
      null,
    ),
  model_unavailable: ({ model }) => critical(`${model} isn’t available.`, ['choose_model']),
  offline: () => critical('The machine went offline.', ['continue', 'machine_switch']),
  interrupted: (_names, { reason }) =>
    withDetail(
      { tone: 'variant', icon: 'clock', title: 'Interrupted', actions: ['continue'] },
      reason,
    ),
  stopped: () =>
    withDetail({ tone: 'variant', icon: 'square', title: 'Stopped', actions: ['continue'] }, null),
  unknown: (_names, { reason, native }) =>
    withDetail(
      { tone: 'critical', icon: 'alert', title: 'The reply failed.', actions: ['continue'] },
      native === true ? reason : null,
    ),
};

export function failureCopy(
  code: AssistantReasonCode | null,
  context: FailureContext,
): FailureCopy {
  const names = { model: context.model ?? MODEL_FALLBACK };
  return ROWS[code ?? 'unknown'](names, context);
}
