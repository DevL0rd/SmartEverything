import {
  ASSISTANT_CONTINUE_NOTE,
  helperDialogueOf,
  isRetiredFailedAction,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { clock } from '../../../format/time';
import {
  TIME_GAP_MS,
  isAssistantReply,
  positionOf,
  speakerOf,
  type MessageSpeaker,
  type RunPosition,
} from '../model/speaker';
import {
  continuesRun,
  isGroup,
  originOf,
  participantOf,
  rosterOf,
  type Cast,
  type ItemOrigin,
  type Participant,
} from '../model/participant';
import {
  mentionIndexOf,
  mentionsOf,
  type MentionIndex,
  type MessageToken,
} from '../model/mentions';
import type { TurnStats } from '../model/chat-display';
import { compareText } from '../../../format/text';
import { sameJson } from '../../../store/same-json';
import { replyTimeline, visibleReplyParts } from '../model/reply-timeline';
import { replySegments, type ReplySegment } from '../model/reply-segments';
import { dayFactsOf, sameDay } from './thread-days';
import { withTurnStats } from './thread-turns';

export interface MessageItem {
  readonly type: 'message';
  readonly key: string;
  readonly row: AssistantMessageRow;
  readonly speaker: MessageSpeaker;
  readonly participant: Participant | null;
  readonly host: boolean;
  readonly origin: ItemOrigin | null;
  readonly quote: AssistantMessageRow['quote'];
  readonly quoted: QuotedOriginal | null;
  readonly mentions: readonly MessageToken[] | null;
  readonly stats: TurnStats | null;
  readonly position: RunPosition;
  readonly day: string | null;
  readonly dayName: string;
  readonly gap: string | null;
  readonly divider: boolean;
  readonly latestReply: boolean;
  readonly group: boolean;
  readonly waiting: boolean;
  readonly replied: boolean;
  readonly costPeak: number | null;
  readonly segment: ReplySegment | null;
}

export interface QuotedOriginal {
  readonly row: AssistantMessageRow;
  readonly participant: Participant | null;
}

export interface ThreadOptions {
  readonly cast: Cast;
  readonly showSteps?: boolean;
  readonly now: number;
  readonly timeZone: string | null;
  readonly unreadAfter: string | null;
  readonly openedAt: number;
  readonly hidden: ReadonlySet<string>;
}

export function sameMessage(left: MessageItem, right: MessageItem): boolean {
  return (
    left.row === right.row &&
    left.speaker.name === right.speaker.name &&
    left.participant?.id === right.participant?.id &&
    left.participant?.name === right.participant?.name &&
    sameMessagePresentation(left, right)
  );
}

function sameMessagePresentation(left: MessageItem, right: MessageItem): boolean {
  return (
    left.position === right.position &&
    left.day === right.day &&
    left.gap === right.gap &&
    left.divider === right.divider &&
    left.latestReply === right.latestReply &&
    left.group === right.group &&
    sameJson(left.mentions, right.mentions) &&
    sameMessageState(left, right)
  );
}

function sameMessageState(left: MessageItem, right: MessageItem): boolean {
  return (
    left.waiting === right.waiting &&
    left.replied === right.replied &&
    left.costPeak === right.costPeak &&
    left.segment === right.segment &&
    sameQuoted(left.quoted, right.quoted) &&
    sameJson(left.stats, right.stats)
  );
}

function sameQuoted(left: QuotedOriginal | null, right: QuotedOriginal | null): boolean {
  if (left === null || right === null) return left === right;
  return left.row === right.row && left.participant?.id === right.participant?.id;
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

function hiddenToolOnlyReply(row: AssistantMessageRow, showSteps: boolean): boolean {
  if (showSteps || row.role !== 'responder' || row.state === 'working' || row.state === 'failed')
    return false;
  return (
    row.attachments.length === 0 &&
    row.embeds.every((embed) => embed.kind === 'chat_timeline') &&
    visibleReplyParts(row, false)?.length === 0
  );
}

function isResumeNote(row: AssistantMessageRow): boolean {
  return (
    row.role === 'system' &&
    row.kind === 'update' &&
    row.origin?.source === 'hub' &&
    row.text === ASSISTANT_CONTINUE_NOTE
  );
}

function shown(row: AssistantMessageRow): boolean {
  if (isResumeNote(row)) return false;
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

function withoutDuplicateActions(
  rows: readonly AssistantMessageRow[],
): readonly AssistantMessageRow[] {
  const replies = new Map<string, AssistantMessageRow>();
  return rows.filter((row) => {
    if (row.role === 'responder' && row.kind === 'text' && helperDialogueOf(row) === undefined) {
      replies.set(row.chat_id, row);
    }
    if (row.role !== 'system' || row.kind !== 'action' || row.origin !== null) return true;
    const reply = replies.get(row.chat_id);
    if (reply === undefined || row.created_at > reply.updated_at) return true;
    return replyTimeline(reply)?.parts.some((part) => part.kind === 'tool') !== true;
  });
}

function latestReplyId(rows: readonly AssistantMessageRow[]): string | null {
  const latest = rows.findLast(
    (row) =>
      isAssistantReply(row) && row.kind === 'text' && row.state !== 'working' && hasContent(row),
  );
  return latest?.id ?? null;
}

function isUnread(entry: Entry, options: ThreadOptions): boolean {
  const { row } = entry;
  const { unreadAfter, openedAt } = options;
  if (unreadAfter === null || row.created_at <= unreadAfter) {
    return false;
  }
  if (Date.parse(row.created_at) > openedAt || row.kind === 'call') {
    return false;
  }
  const { kind } = entry.speaker;
  return kind === 'ai' || kind === 'person';
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
    helperDialogueOf(row) === undefined &&
    row.role === 'person' &&
    (row.state === 'queued' || row.state === 'delivered') &&
    row.created_at >= busySince
  );
}

interface Entry {
  readonly row: AssistantMessageRow;
  readonly speaker: MessageSpeaker;
  readonly participant: Participant | null;
}

function entryOf(row: AssistantMessageRow, cast: Cast): Entry {
  const speaker = speakerOf(row, cast.assistant.name);
  return { row, speaker, participant: participantOf(row, speaker, cast) };
}

interface Context {
  readonly entries: readonly Entry[];
  readonly options: ThreadOptions;
  readonly latestId: string | null;
  readonly dividerId: string | null;
  readonly group: boolean;
  readonly mentionIndex: MentionIndex | null;
  readonly busySince: string | null;
  readonly repliedTo: ReadonlySet<string>;
  readonly byId: ReadonlyMap<string, Entry>;
}

function quotedOf(row: AssistantMessageRow, context: Context): QuotedOriginal | null {
  return row.quote === null ? null : (context.byId.get(row.quote.message_id) ?? null);
}

function continuesAfter(entry: Entry, next: Entry | undefined, context: Context): boolean {
  return (
    next !== undefined &&
    next.row.id !== context.dividerId &&
    sameDay(entry.row, next.row, context.options) &&
    continuesRun(entry, next)
  );
}

function messageItem(entry: Entry, index: number, context: Context): MessageItem {
  const { entries, options, latestId, dividerId, group, busySince, repliedTo } = context;
  const { row } = entry;
  const previous = entries[index - 1];
  const newDay = previous === undefined || !sameDay(previous.row, row, options);
  const dayName = dayFactsOf(row.created_at, options).name;
  const before = !newDay && row.id !== dividerId && continuesRun(previous, entry);
  const after = continuesAfter(entry, entries[index + 1], context);
  return {
    type: 'message',
    key: row.id,
    row,
    speaker: entry.speaker,
    participant: entry.participant,
    host: entry.participant?.id === options.cast.host.id,
    origin: originOf(row, entry.speaker),
    quote: row.quote,
    quoted: quotedOf(row, context),
    mentions: mentionsOf(row, context.mentionIndex),
    stats: null,
    position: positionOf(before, after),
    day: newDay ? dayName : null,
    dayName,
    gap: gapLabel(previous?.row, row, newDay, options.timeZone),
    divider: row.id === dividerId,
    latestReply: row.id === latestId,
    group,
    waiting: isWaiting(row, busySince),
    replied: repliedTo.has(row.id),
    costPeak: null,
    segment: null,
  };
}

function segmented(item: MessageItem, showSteps: boolean): readonly MessageItem[] {
  const { row } = item;
  if (helperDialogueOf(row) !== undefined || row.role !== 'responder' || row.state === 'working')
    return [item];
  const parts = visibleReplyParts(row, showSteps);
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

export function marksStoppedTurn(item: MessageItem): boolean {
  return (
    item.row.state === 'failed' &&
    item.row.reason_code === 'stopped' &&
    endsMessage(item) &&
    (isAssistantReply(item.row) || (item.speaker.kind === 'me' && !item.replied))
  );
}

export function threadOf(
  rows: readonly AssistantMessageRow[],
  options: ThreadOptions,
): readonly MessageItem[] {
  const showSteps = options.showSteps !== false;
  const visible = withoutDuplicateActions(
    chronological(
      rows.filter(
        (row) => shown(row) && !options.hidden.has(row.id) && !hiddenToolOnlyReply(row, showSteps),
      ),
    ),
  );
  const repliedTo = new Set(
    visible.flatMap((row) => (row.reply_to === null ? [] : [row.reply_to])),
  );
  const entries = visible.map((row) => entryOf(row, options.cast));
  const roster = rosterOf(entries);
  const context: Context = {
    entries,
    options,
    latestId: latestReplyId(visible),
    dividerId: entries.find((entry) => isUnread(entry, options))?.row.id ?? null,
    group: isGroup(roster),
    mentionIndex: mentionIndexOf(roster),
    repliedTo,
    byId: new Map(entries.map((entry) => [entry.row.id, entry])),
    busySince: visible.find(isWorkingRow)?.created_at ?? null,
  };
  const items = entries.flatMap((entry, index) =>
    segmented(messageItem(entry, index, context), showSteps),
  );
  return [...withTurnStats(items)].reverse();
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
