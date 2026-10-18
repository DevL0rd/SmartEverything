import { router } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import {
  isChatActivity,
  type AiChatRow,
  type AssistantMessageRow,
  type AiMessageReference,
  type Engine,
} from '@smarteverything/domain';
import { branchAiChat, latestChatMessages } from '../../../api/ai';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import { setReferenceDraft } from '../data/drafts';

const log = new Logger('app.chat');

export interface BranchOptions {
  readonly prefill?: string;
  readonly references?: readonly AiMessageReference[];
  readonly engine?: Engine;
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
  const operation = log.operation('chat.branch_open', {
    chatId,
    messageId,
    engineKind: options.engine?.kind ?? null,
    prefillLength: options.prefill?.length ?? 0,
  });
  try {
    const branch = await branchAiChat(chatId, messageId, options.engine);
    if (options.prefill !== undefined) {
      setReferenceDraft(branch.id, { text: options.prefill, references: options.references ?? [] });
    }
    router.push(href.assistantChat(branch.id));
    operation.succeeded({ branchId: branch.id });
    return branch;
  } catch (error) {
    operation.failed(error);
    notify({ message: 'Couldn’t branch the chat', error, tone: 'critical' });
    return null;
  }
}

export async function continueInBranch(
  chatId: string,
  engine: Engine,
  modelName: string,
): Promise<void> {
  try {
    const point = latestBranchPoint(await latestChatMessages(chatId));
    if (point === null) {
      log.info('chat.continue_skipped', { chatId, reason: 'no-settled-message' });
      notify({ message: 'Nothing to continue from yet' });
      return;
    }
    const branch = await branchChat(chatId, point, { engine });
    if (branch === null) return;
    notify({
      message: `Continued in a new chat with ${modelName}`,
      action: {
        label: 'Back',
        onPress: (): void => {
          router.navigate(href.assistantChat(chatId));
        },
      },
    });
  } catch (error) {
    log.error('chat.continue_failed', error, { chatId, engineKind: engine.kind });
    notify({ message: 'Couldn’t branch the chat', error, tone: 'critical' });
  }
}
