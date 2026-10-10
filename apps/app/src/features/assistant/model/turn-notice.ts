import type { AssistantReasonCode } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type NoticeAction = 'retry' | 'regenerate' | 'open-credits' | 'choose-model';

type NoticeTone = 'critical' | 'neutral';

export type NoticeSubject = 'request' | 'reply';

export interface NoticeSpec {
  readonly tone: NoticeTone;
  readonly icon: IconName;
  readonly title: string;
  readonly body: string | null;
  readonly actions: readonly NoticeAction[];
  readonly inline: boolean;
}

const KEPT = 'Your message is kept.';

const NEUTRAL_OFFLINE: NoticeSpec = {
  tone: 'neutral',
  icon: 'wifi',
  title: 'Your server is offline',
  body: 'It sends when the server is back.',
  actions: [],
  inline: false,
};

const STOPPED: NoticeSpec = {
  tone: 'neutral',
  icon: 'square',
  title: 'Stopped',
  body: null,
  actions: ['regenerate'],
  inline: true,
};

function interrupted(subject: NoticeSubject): NoticeSpec {
  return {
    tone: 'neutral',
    icon: 'refresh',
    title: 'Stopped when your server restarted',
    body: subject === 'reply' ? 'The answer above is incomplete.' : 'Nothing was answered.',
    actions: ['retry'],
    inline: false,
  };
}

const SENTENCE_END = /[.!?…]$/;

function withKept(body: string, subject: NoticeSubject): string {
  if (subject !== 'request') {
    return body;
  }
  const closed = SENTENCE_END.test(body) ? body : `${body}.`;
  return `${closed} ${KEPT}`;
}

function critical(title: string, body: string, actions: readonly NoticeAction[]): NoticeSpec {
  return { tone: 'critical', icon: 'alert', title, body, actions, inline: false };
}

function coded(code: AssistantReasonCode, subject: NoticeSubject): NoticeSpec | null {
  switch (code) {
    case 'credits':
      return critical(
        'Out of OpenRouter credits',
        withKept('Add credits, then try again.', subject),
        ['retry', 'open-credits'],
      );
    case 'rate_limit':
      return critical(
        'The model is busy',
        withKept('It refused because of too many requests.', subject),
        ['retry'],
      );
    case 'model_unavailable':
      return critical(
        'That model isn’t available',
        withKept('Pick another model for this chat.', subject),
        ['choose-model', 'retry'],
      );
    case 'offline':
      return NEUTRAL_OFFLINE;
    case 'interrupted':
      return interrupted(subject);
    case 'stopped':
      return STOPPED;
    case 'unknown':
      return null;
  }
}

function unknownNotice(reason: string | null, subject: NoticeSubject): NoticeSpec {
  return {
    tone: 'critical',
    icon: 'alert',
    title: 'Couldn’t answer',
    body: reason === null ? withKept('Something went wrong.', subject) : withKept(reason, subject),
    actions: ['retry'],
    inline: false,
  };
}

export function noticeOf(
  code: AssistantReasonCode | null,
  reason: string | null,
  subject: NoticeSubject,
): NoticeSpec {
  const known = code === null ? null : coded(code, subject);
  return known ?? unknownNotice(reason, subject);
}

export function failedBubbleLabel(code: AssistantReasonCode | null): string {
  return code === 'interrupted' ? 'Not answered' : 'Not sent';
}
