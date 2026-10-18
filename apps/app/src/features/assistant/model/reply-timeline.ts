import {
  CHAT_TIMELINE_EMBED,
  type AssistantMessageRow,
  type ChatTimelineEmbed,
} from '@smarteverything/domain';
import { BoundedMap } from '../../../design/bounded-map';
import { sameJson } from '../../../store/same-json';
import { inlineTimeline, type InlineTimelinePart } from './inline-timeline';

const timelines = new WeakMap<AssistantMessageRow, ChatTimelineEmbed | null>();

function parsedTimeline(row: AssistantMessageRow): ChatTimelineEmbed | null {
  const embed = row.embeds.find((entry) => entry.kind === 'chat_timeline');
  if (embed === undefined) return null;
  const parsed = CHAT_TIMELINE_EMBED.safeParse(embed);
  return parsed.success ? parsed.data : null;
}

const SHARED_ROWS = 300;

const latestTimelines = new BoundedMap<string, ChatTimelineEmbed>(SHARED_ROWS);
const inlineParts = new WeakMap<AssistantMessageRow, readonly InlineTimelinePart[]>();
const latestParts = new BoundedMap<string, readonly InlineTimelinePart[]>(SHARED_ROWS);

function sharedItems<T>(previous: readonly T[] | undefined, next: readonly T[]): T[] {
  return next.map((item, index) => {
    const before = previous?.[index];
    return before !== undefined && sameJson(before, item) ? before : item;
  });
}

export function replyTimeline(row: AssistantMessageRow): ChatTimelineEmbed | null {
  const known = timelines.get(row);
  if (known !== undefined) return known;
  const parsed = parsedTimeline(row);
  const previous = latestTimelines.get(row.id);
  const shared =
    parsed === null ? null : { ...parsed, parts: sharedItems(previous?.parts, parsed.parts) };
  if (shared !== null) latestTimelines.set(row.id, shared);
  timelines.set(row, shared);
  return shared;
}

export function replyParts(row: AssistantMessageRow): readonly InlineTimelinePart[] | null {
  const known = inlineParts.get(row);
  if (known !== undefined) return known;
  const timeline = replyTimeline(row);
  if (timeline === null) return null;
  const parts = sharedItems(latestParts.get(row.id), inlineTimeline(timeline.parts));
  latestParts.set(row.id, parts);
  inlineParts.set(row, parts);
  return parts;
}

export function imageTimelineIds(rows: readonly AssistantMessageRow[]): ReadonlySet<string> {
  return new Set(
    rows.flatMap(
      (row) =>
        replyTimeline(row)?.parts.flatMap((part) =>
          part.kind === 'tool' && part.tool.image_operation_id !== null
            ? [part.tool.image_operation_id]
            : [],
        ) ?? [],
    ),
  );
}

export function hasReplyTimeline(row: AssistantMessageRow): boolean {
  return row.embeds.some((embed) => embed.kind === 'chat_timeline');
}
