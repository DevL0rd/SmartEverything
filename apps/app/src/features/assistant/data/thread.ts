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
    left.created_at.localeCompare(right.created_at) ||
    ROLE_RANK[left.role] - ROLE_RANK[right.role] ||
    left.id.localeCompare(right.id)
  );
}

function chronological(rows: readonly AssistantMessageRow[]): readonly AssistantMessageRow[] {
  return [...rows].sort(ordered);
}

function hasContent(row: AssistantMessageRow): boolean {
  return row.text.trim() !== '' || row.attachments.length > 0 || row.embeds.length > 0;
}

function shown(row: AssistantMessageRow): boolean {
  if (isRetiredFailedAction(row)) {
    return false;
  }
  if (row.role === 'person' || hasContent(row)) {
    return true;
  }
  if (row.state === 'working') {
    return true;
  }
  return row.state === 'failed' && row.steps.length > 0;
}

function awaitingReply(request: AssistantMessageRow, repliedTo: ReadonlySet<string>): boolean {
  return (
    request.role === 'person' &&
    (request.state === 'delivered' || request.state === 'working') &&
    !repliedTo.has(request.id)
  );
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

function sameDay(
  left: AssistantMessageRow,
  right: AssistantMessageRow,
  timeZone: string | null,
): boolean {
  return localDayKey(left.created_at, timeZone) === localDayKey(right.created_at, timeZone);
}

function messageItem(row: AssistantMessageRow, index: number, context: Context): MessageItem {
  const { visible, options, latestId, dividerId, multiParty, busySince, repliedTo } = context;
  const previous = visible[index - 1];
  const next = visible[index + 1];
  const newDay = previous === undefined || !sameDay(previous, row, options.timeZone);
  const dayName = dayLabel(row.created_at, options.now, options.timeZone);
  const before = !newDay && row.id !== dividerId && continuesRun(previous, row);
  const after =
    next !== undefined &&
    next.id !== dividerId &&
    sameDay(row, next, options.timeZone) &&
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
  };
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
    busySince:
      visible.find((row) => row.role === 'responder' && row.state === 'working')?.created_at ??
      null,
  };
  const items = visible.map((row, index) => messageItem(row, index, context));
  return [
    ...items.filter((item) => !isWorkingRow(item.row)),
    ...items.filter((item) => isWorkingRow(item.row)),
  ].toReversed();
}

function isWorkingRow(row: AssistantMessageRow): boolean {
  return row.role === 'responder' && row.state === 'working';
}

export function statusRequestOf(rows: readonly AssistantMessageRow[]): AssistantMessageRow | null {
  const ordered = chronological(rows);
  const working = ordered.findLast(isWorkingRow);
  if (working === undefined) {
    return pendingRequestOf(ordered);
  }
  return ordered.find((row) => row.id === working.reply_to) ?? working;
}

export function pendingRequestOf(rows: readonly AssistantMessageRow[]): AssistantMessageRow | null {
  const repliedTo = new Set(rows.flatMap((row) => (row.reply_to === null ? [] : [row.reply_to])));
  return rows.find((row) => awaitingReply(row, repliedTo)) ?? null;
}

export function isFooter(item: MessageItem): boolean {
  return isWorkingRow(item.row);
}

export function oldestOf(rows: readonly AssistantMessageRow[]): string | null {
  return chronological(rows)[0]?.created_at ?? null;
}
