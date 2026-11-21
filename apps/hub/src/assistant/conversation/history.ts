import {
  COMPACTION_EMBED,
  type AssistantMessageRow,
  type CompactionEmbed,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { isHelperDialogueMirror } from '../delegation/relay-speaker';

export interface ChatContext {
  readonly summary: string | null;
  readonly rows: readonly AssistantMessageRow[];
}

function compactionOf(row: AssistantMessageRow): CompactionEmbed | null {
  for (const embed of row.embeds) {
    const parsed = COMPACTION_EMBED.safeParse(embed);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

export function transcriptLine(row: AssistantMessageRow): string {
  const who = row.role === 'responder' ? 'AI' : row.role === 'person' ? row.author : 'Note';
  return `${who}: ${row.text}`;
}

export async function chatContext(
  store: Pick<Store, 'host'>,
  chatId: string,
): Promise<ChatContext> {
  const latest = await store.host.call('assistantChat', 'latestWithEmbed', chatId, 'compaction');
  const marker = latest === undefined ? null : compactionOf(latest);
  if (latest !== undefined && marker === null) {
    throw new Error(`The compaction note ${latest.id} has no readable end point.`);
  }
  return {
    summary: latest?.text ?? null,
    rows: (
      await store.host.call('assistantChat', 'since', chatId, marker?.through_at ?? null)
    ).filter((row) => !isHelperDialogueMirror(row) && compactionOf(row) === null),
  };
}
