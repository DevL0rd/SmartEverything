import {
  helperDialogueOf,
  isInterruption,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { noticeOf } from './turn-notice';
import { isAssistantReply } from './speaker';

const REPLY_SPOKEN_MAX = 300;

export interface Announcement {
  readonly text: string;
  readonly urgent: boolean;
}

export interface AnnouncementFrame {
  readonly revision: number;
  readonly rows: readonly AssistantMessageRow[];
}

function announcedReply(row: AssistantMessageRow | undefined): Announcement | null {
  return row?.kind === 'text' && isAssistantReply(row) ? announcementOf(row) : null;
}

export function replyAnnouncements(
  previous: AnnouncementFrame | null,
  current: AnnouncementFrame,
): readonly Announcement[] {
  if (previous?.revision !== current.revision || previous.rows === current.rows) return [];
  const before = new Map(previous.rows.map((row) => [row.id, row]));
  const changes: { readonly row: AssistantMessageRow; readonly speech: Announcement }[] = [];
  for (const row of current.rows) {
    const oldRow = before.get(row.id);
    if (row === oldRow) continue;
    const speech = announcedReply(row);
    if (speech === null) continue;
    const old = announcedReply(oldRow);
    if (old?.text === speech.text && old.urgent === speech.urgent) continue;
    changes.push({ row, speech });
  }
  return changes
    .sort(
      (left, right) =>
        Date.parse(left.row.updated_at) - Date.parse(right.row.updated_at) ||
        Date.parse(left.row.created_at) - Date.parse(right.row.created_at),
    )
    .map(({ speech }) => speech);
}

function spoken(text: string): string {
  const flat = text.replaceAll(/\s+/gu, ' ').trim();
  return flat.length <= REPLY_SPOKEN_MAX
    ? flat
    : `${flat.slice(0, REPLY_SPOKEN_MAX).trimEnd()}… Reply continues`;
}

function helperNameOf(row: AssistantMessageRow): string | null {
  const dialogue = helperDialogueOf(row);
  return dialogue?.direction === 'from_helper' ? dialogue.helper_name : null;
}

function settledHelperAnnouncement(helper: string | null, reply: string): Announcement | null {
  if (helper === null) return null;
  const excerpt = spoken(reply);
  const text = excerpt === '' ? `${helper} replied` : `${helper} replied: ${excerpt}`;
  return { text, urgent: false };
}

export function announcementOf(row: AssistantMessageRow): Announcement | null {
  const helper = helperNameOf(row);
  const author = helper ?? row.author;
  switch (row.state) {
    case 'working':
      return { text: `${author} is answering`, urgent: false };
    case 'answered':
      return (
        settledHelperAnnouncement(helper, row.text) ?? {
          text: `${author} replied: ${spoken(row.text)}`,
          urgent: false,
        }
      );
    case 'failed': {
      const title = noticeOf(row.reason_code, row.reason).title;
      return isInterruption(row.reason_code)
        ? { text: title, urgent: false }
        : { text: `Failed: ${title}`, urgent: true };
    }
    case 'queued':
    case 'delivered':
    case null:
      return settledHelperAnnouncement(helper, row.text);
  }
}
