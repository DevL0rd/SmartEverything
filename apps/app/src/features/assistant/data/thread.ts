import { isRetiredFailedAction, type AssistantMessageRow } from '@smarteverything/domain';
import { clock, dayLabel, localDayKey } from '../../../format/time';
import {
  TIME_GAP_MS,
  continuesRun,
  positionOf,
  speakerOf,
  type MessageSpeaker,
  type RunPosition,
} from '../model/speaker';
import { compareText } from '../../../format/text';
import { replyParts } from '../model/reply-timeline';
import { replySegments, type ReplySegment } from '../model/reply-segments';

export interface MessageItem {
  readonly type: 'message';
  readonly key: string;
  readonly row: AssistantMessageRow;
  readonly speaker: MessageSpeaker;
  readonly position: RunPosition;
  readonly day: string | null;
  readonly dayName: string;
  readonly gap: string | null;
  readonly divider: boolean;
  readonly latestReply: boolean;
  readonly multiParty: boolean;
  readonly waiting: boolean;
  readonly replied: boolean;
  readonly segment: ReplySegment | null;
}

export interface ThreadOptions {
  readonly now: number;
  readonly timeZone: string | null;
  readonly unreadAfter: string | null;
  readonly openedAt: number;
  readonly hidden: ReadonlySet<string>;
}

const ROLE_RANK: Readonly<Record<AssistantMessageRow['role'], number>> = {
  person: 0,
  system: 1,
  responder: 2,
};

function ordered(left: AssistantMessageRow, right: AssistantMessageRow): number {
  return (
    compareText(left.created_at, right.created_at) ||
    ROLE_RANK[left.role] - ROLE_RANK[right.role] ||
    compareText(left.id, right.id)
  );
}

function chronological(rows: readonly AssistantMessageRow[]): readonly AssistantMessageRow[] {
  return [...rows].sort(ordered);
}

function hasContent(row: AssistantMessageRow): boolean {
  return row.text.trim() !== '' || row.attachments.length > 0 || row.embeds.length > 0;
}

function shown(row: AssistantMessageRow): boolean {
  if (row.embeds.some((embed) => embed.kind === 'tools_changed')) return false;
  if (isRetiredFailedAction(row)) {
    return false;
  }
  if (row.role === 'person' || hasContent(row)) {
    return true;
  }
  if (row.state === 'working') {
    return true;
  }
  return row.state === 'failed';
}

function latestReplyId(rows: readonly AssistantMessageRow[]): string | null {
  const latest = rows.findLast(
    (row) =>
      row.role === 'responder' && row.kind === 'text' && row.state !== 'working' && hasContent(row),
  );
  return latest?.id ?? null;
}

function isUnread(row: AssistantMessageRow, options: ThreadOptions): boolean {
  const { unreadAfter, openedAt } = options;
  if (unreadAfter === null || row.created_at <= unreadAfter) {
    return false;
  }
  if (Date.parse(row.created_at) > openedAt || row.kind === 'call') {
    return false;
  }
  const speaker = speakerOf(row);
  return speaker.kind === 'ai' || speaker.kind === 'person';
}

function gapLabel(
  previous: AssistantMessageRow | undefined,
  row: AssistantMessageRow,
  newDay: boolean,
  timeZone: string | null,
): string | null {
  if (previous === undefined || newDay) {
    return null;
  }
  const apart = Date.parse(row.created_at) - Date.parse(previous.created_at);
  return apart > TIME_GAP_MS ? clock(row.created_at, timeZone) : null;
}

function isWaiting(row: AssistantMessageRow, busySince: string | null): boolean {
  return (
    busySince !== null &&
    row.role === 'person' &&
    (row.state === 'queued' || row.state === 'delivered') &&
    row.created_at >= busySince
  );
}

function isMultiParty(rows: readonly AssistantMessageRow[]): boolean {
  return rows.some((row) => speakerOf(row).kind === 'person');
}

interface Context {
  readonly visible: readonly AssistantMessageRow[];
  readonly options: ThreadOptions;
  readonly latestId: string | null;
  readonly dividerId: string | null;
  readonly multiParty: boolean;
  readonly busySince: string | null;
  readonly repliedTo: ReadonlySet<string>;
}

interface DayFacts {
  readonly key: string;
  readonly name: string;
}

interface DayCache {
  readonly now: number;
  readonly timeZone: string | null;
  readonly facts: Map<string, DayFacts>;
}

let dayCache: DayCache = { now: 0, timeZone: null, facts: new Map() };

function dayFactsOf(createdAt: string, options: ThreadOptions): DayFacts {
  const { now, timeZone } = options;
  if (dayCache.now !== now || dayCache.timeZone !== timeZone) {
    dayCache = { now, timeZone, facts: new Map() };
  }
  const known = dayCache.facts.get(createdAt);
  if (known !== undefined) return known;
  const made = { key: localDayKey(createdAt, timeZone), name: dayLabel(createdAt, now, timeZone) };
  dayCache.facts.set(createdAt, made);
  return made;
}

function sameDay(
  left: AssistantMessageRow,
  right: AssistantMessageRow,
  options: ThreadOptions,
): boolean {
  return dayFactsOf(left.created_at, options).key === dayFactsOf(right.created_at, options).key;
}

function messageItem(row: AssistantMessageRow, index: number, context: Context): MessageItem {
  const { visible, options, latestId, dividerId, multiParty, busySince, repliedTo } = context;
  const previous = visible[index - 1];
  const next = visible[index + 1];
  const newDay = previous === undefined || !sameDay(previous, row, options);
  const dayName = dayFactsOf(row.created_at, options).name;
  const before = !newDay && row.id !== dividerId && continuesRun(previous, row);
  const after =
    next !== undefined &&
    next.id !== dividerId &&
    sameDay(row, next, options) &&
    continuesRun(row, next);
  return {
    type: 'message',
    key: row.id,
    row,
    speaker: speakerOf(row),
    position: positionOf(before, after),
    day: newDay ? dayName : null,
    dayName,
    gap: gapLabel(previous, row, newDay, options.timeZone),
    divider: row.id === dividerId,
    latestReply: row.id === latestId,
    multiParty,
    waiting: isWaiting(row, busySince),
    replied: repliedTo.has(row.id),
    segment: null,
  };
}

function segmented(item: MessageItem): readonly MessageItem[] {
  const { row } = item;
  if (row.role !== 'responder' || row.state === 'working') return [item];
  const parts = replyParts(row);
  const segments = parts === null ? [] : replySegments(parts);
  if (segments.length < 2) return [item];
  return segments.map((segment) =>
    segment.index === 0
      ? { ...item, segment }
      : {
          ...item,
          key: continuationKey(row.id, segment.index),
          position: 'middle',
          day: null,
          gap: null,
          divider: false,
          segment,
        },
  );
}

function continuationKey(id: string, index: number): string {
  return `${id}#${String(index)}`;
}

export function startsMessage(item: MessageItem): boolean {
  return item.segment === null || item.segment.index === 0;
}

export function endsMessage(item: MessageItem): boolean {
  return item.segment === null || item.segment.index === item.segment.count - 1;
}

export function threadOf(
  rows: readonly AssistantMessageRow[],
  options: ThreadOptions,
): readonly MessageItem[] {
  const visible = chronological(rows.filter((row) => shown(row) && !options.hidden.has(row.id)));
  const repliedTo = new Set(
    visible.flatMap((row) => (row.reply_to === null ? [] : [row.reply_to])),
  );
  const context: Context = {
    visible,
    options,
    latestId: latestReplyId(visible),
    dividerId: visible.find((row) => isUnread(row, options))?.id ?? null,
    multiParty: isMultiParty(visible),
    repliedTo,
    busySince: visible.find(isWorkingRow)?.created_at ?? null,
  };
  const items = visible.flatMap((row, index) => segmented(messageItem(row, index, context)));
  return items.reverse();
}

function isWorkingRow(row: AssistantMessageRow): boolean {
  return row.role === 'responder' && row.state === 'working';
}

export function isFooter(item: MessageItem): boolean {
  return isWorkingRow(item.row);
}

export function oldestOf(rows: readonly AssistantMessageRow[]): string | null {
  return chronological(rows)[0]?.created_at ?? null;
}
