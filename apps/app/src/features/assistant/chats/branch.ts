import { router } from 'expo-router';
import {
  isChatActivity,
  type AiChatRow,
  type AssistantMessageRow,
  type AiMessageReference,
} from '@smarteverything/domain';
import { branchAiChat } from '../../../api/ai';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import { setReferenceDraft } from '../data/drafts';

export interface BranchOptions {
  readonly prefill?: string;
  readonly references?: readonly AiMessageReference[];
}

export function latestBranchPoint(rows: readonly AssistantMessageRow[]): string | null {
  const settled = rows.filter(
    (row) => isChatActivity(row) && row.state !== 'queued' && row.state !== 'working',
  );
  const latest = settled.reduce<AssistantMessageRow | null>(
    (best, row) => (best === null || row.created_at > best.created_at ? row : best),
    null,
  );
  return latest?.id ?? null;
}

export async function branchChat(
  chatId: string,
  messageId: string,
  options: BranchOptions = {},
): Promise<AiChatRow | null> {
  try {
    const branch = await branchAiChat(chatId, messageId);
    if (options.prefill !== undefined) {
      setReferenceDraft(branch.id, { text: options.prefill, references: options.references ?? [] });
    }
    router.push(href.assistantChat(branch.id));
    return branch;
  } catch (error) {
    notify({ message: 'Couldn’t branch the chat', error, tone: 'critical' });
    return null;
  }
}
