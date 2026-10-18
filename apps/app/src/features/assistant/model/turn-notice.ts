import type { AssistantReasonCode } from '@smarteverything/domain';
import { failureCopy, type FailureCopy } from './failure-copy';

export type NoticeSubject = 'request' | 'reply';

export function noticeOf(
  code: AssistantReasonCode | null,
  reason: string | null,
  _subject: NoticeSubject,
): FailureCopy {
  return failureCopy(code, { model: null, reason });
}

export function failedBubbleLabel(code: AssistantReasonCode | null): string {
  if (code === 'stopped') return 'Stopped';
  return code === 'interrupted' ? 'Interrupted' : 'Not sent';
}
