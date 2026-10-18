import type { AssistantReasonCode } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type FailureAction =
  'retry' | 'regenerate' | 'continue' | 'choose_model' | 'switch_machine' | 'top_up';

export interface FailureContext {
  readonly model: string | null;
  readonly reason: string | null;
}

export interface FailureCopy {
  readonly tone: 'critical' | 'neutral';
  readonly icon: IconName;
  readonly title: string;
  readonly body: string | null;
  readonly actions: readonly FailureAction[];
}

const MODEL_FALLBACK = 'The model';

function critical(
  title: string,
  body: string | null,
  actions: readonly FailureAction[],
): FailureCopy {
  return { tone: 'critical', icon: 'alert', title, body, actions };
}

export const PLAIN_ERROR = 'An error occurred. Please try again.';

type Row = (names: Names, context: FailureContext) => FailureCopy;

interface Names {
  readonly model: string;
}

const STOPPED: FailureCopy = {
  tone: 'neutral',
  icon: 'square',
  title: 'Stopped',
  body: null,
  actions: ['continue'],
};

const ROWS: Readonly<Record<AssistantReasonCode, Row>> = {
  credits: () =>
    critical('Out of OpenRouter credits', 'Add credit or pick a model on another plan.', [
      'top_up',
      'choose_model',
    ]),
  rate_limit: () => critical(PLAIN_ERROR, null, ['retry', 'choose_model']),
  model_unavailable: ({ model }) =>
    critical(`${model} isn’t available`, null, ['choose_model', 'retry']),
  offline: () => critical(PLAIN_ERROR, null, ['retry', 'switch_machine']),
  interrupted: (_names, { reason }) => ({
    tone: 'neutral',
    icon: 'clock',
    title: 'Interrupted',
    body: reason,
    actions: ['continue'],
  }),
  stopped: () => STOPPED,
  unknown: () => critical(PLAIN_ERROR, null, ['retry']),
};

export function failureCopy(
  code: AssistantReasonCode | null,
  context: FailureContext,
): FailureCopy {
  const names = { model: context.model ?? MODEL_FALLBACK };
  return ROWS[code ?? 'unknown'](names, context);
}
