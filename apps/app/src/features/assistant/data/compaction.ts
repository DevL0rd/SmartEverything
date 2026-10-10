import { COMPACTION_EMBED, type AssistantMessageRow } from '@smarteverything/domain';

export function isCompaction(row: AssistantMessageRow): boolean {
  return row.embeds.some((embed) => COMPACTION_EMBED.safeParse(embed).success);
}
