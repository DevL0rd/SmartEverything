import {
  CHAT_TIMELINE_EMBED,
  type AssistantMessageRow,
  type ChatTimelineEmbed,
} from '@smarteverything/domain';

export function replyTimeline(row: AssistantMessageRow): ChatTimelineEmbed | null {
  const embed = row.embeds.find((entry) => entry.kind === 'chat_timeline');
  if (embed === undefined) return null;
  const parsed = CHAT_TIMELINE_EMBED.safeParse(embed);
  return parsed.success ? parsed.data : null;
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
