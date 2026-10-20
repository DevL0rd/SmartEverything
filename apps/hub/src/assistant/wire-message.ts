import {
  CHAT_TIMELINE_EMBED,
  boundedTimeline,
  compactTimeline,
  type AssistantMessageRow,
} from '@smarteverything/domain';

type Embed = AssistantMessageRow['embeds'][number];

function wireEmbed(embed: Embed): Embed {
  if (embed.kind !== 'chat_timeline') return embed;
  const parsed = CHAT_TIMELINE_EMBED.safeParse(embed);
  if (!parsed.success) return embed;
  const bounded = boundedTimeline(parsed.data);
  const wired = compactTimeline(bounded);
  return wired === parsed.data ? embed : wired;
}

export function wireMessage(row: AssistantMessageRow): AssistantMessageRow {
  const embeds = row.embeds.map(wireEmbed);
  return embeds.some((embed, index) => embed !== row.embeds[index]) ? { ...row, embeds } : row;
}

export function wireMessages(rows: readonly AssistantMessageRow[]): AssistantMessageRow[] {
  return rows.map(wireMessage);
}
