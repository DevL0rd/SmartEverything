import type { AssistantReasonCode } from '@smarteverything/domain';
import {
  failureCopy,
  type FailureAction,
  type FailureCopy,
  type FailureTone,
} from './failure-copy';

export function noticeOf(code: AssistantReasonCode | null, reason: string | null): FailureCopy {
  return failureCopy(code, { model: null, reason });
}

export function failedBubbleLabel(code: AssistantReasonCode | null): string {
  if (code === 'stopped') return 'Stopped';
  return code === 'interrupted' ? 'Interrupted' : 'Not sent';
}

const LABELS: Readonly<Record<Exclude<FailureAction, 'continue'>, string>> = {
  choose_model: 'Switch model',
  machine_switch: 'Switch machine',
  top_up: 'Top up',
  details: 'Details',
};

export function actionLabelOf(action: FailureAction, tone: FailureTone): string {
  if (action !== 'continue') return LABELS[action];
  return tone === 'variant' ? 'Continue' : 'Retry';
}
