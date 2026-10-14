import type { AssistantReasonCode } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export const CHAT_ERROR_MESSAGE = 'An error occurred. Please try again.';
export type NoticeAction = 'retry' | 'regenerate';
export type NoticeSubject = 'request' | 'reply';
export interface NoticeSpec {
  readonly tone: 'critical' | 'neutral';
  readonly icon: IconName;
  readonly title: string;
  readonly body: string | null;
  readonly actions: readonly NoticeAction[];
  readonly inline: boolean;
}
export function noticeOf(
  code: AssistantReasonCode | null,
  _reason: string | null,
  _subject: NoticeSubject,
): NoticeSpec {
  const stopped = code === 'stopped';
  return {
    tone: stopped ? 'neutral' : 'critical',
    icon: stopped ? 'square' : 'alert',
    title: stopped ? 'Stopped' : CHAT_ERROR_MESSAGE,
    body: null,
    actions: stopped ? ['regenerate'] : ['retry'],
    inline: true,
  };
}
export function failedBubbleLabel(code: AssistantReasonCode | null): string {
  return code === 'interrupted' ? 'Not answered' : 'Not sent';
}
