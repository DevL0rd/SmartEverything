import { isInterruption, type AssistantMessageRow } from '@smarteverything/domain';
import { noticeOf } from './turn-notice';

const REPLY_SPOKEN_MAX = 300;

export interface Announcement {
  readonly text: string;
  readonly urgent: boolean;
}

function spoken(text: string): string {
  const flat = text.replaceAll(/\s+/gu, ' ').trim();
  return flat.length <= REPLY_SPOKEN_MAX
    ? flat
    : `${flat.slice(0, REPLY_SPOKEN_MAX).trimEnd()}… Reply continues`;
}

export function announcementOf(row: AssistantMessageRow): Announcement | null {
  switch (row.state) {
    case 'working':
      return { text: `${row.author} is answering`, urgent: false };
    case 'answered':
      return { text: `${row.author} replied: ${spoken(row.text)}`, urgent: false };
    case 'failed': {
      const title = noticeOf(row.reason_code, row.reason, 'reply').title;
      return isInterruption(row.reason_code)
        ? { text: title, urgent: false }
        : { text: `Failed: ${title}`, urgent: true };
    }
    case 'queued':
    case 'delivered':
    case null:
      return null;
  }
}
