import type { QueryClient } from '@tanstack/react-query';
import type { CodexProviderEvent } from '@smarteverything/domain';
import {
  codexProviderKey,
  withCodexProviderEvent,
  type CodexChatProvider,
} from './codex-provider-events';
import { runningRead } from './running-read';
import { noticeHandler } from '../store/notice-registry';
import { background } from '@smarteverything/logging';

function applyEvent(
  client: QueryClient,
  chatId: string,
  event: CodexProviderEvent,
  retryOtherJob = true,
): void {
  const key = codexProviderKey(chatId);
  const state = client.getQueryData<CodexChatProvider>(key);
  const running = runningRead(client, key);
  if (running) {
    const again = (): void => {
      applyEvent(client, chatId, event, retryOtherJob);
    };
    background(running.then(again, again), 'codex_provider_notices.background_failed');
    return;
  }
  if (state?.job_id !== event.job_id) {
    const reread = client.invalidateQueries({ queryKey: key }, { cancelRefetch: false });
    if (retryOtherJob)
      background(
        reread.then(() => {
          applyEvent(client, chatId, event, false);
        }),
        'codex_provider_notices.background_failed',
      );
    return;
  }
  const sequence = state.events.reduce((seq, known) => Math.max(seq, known.seq), 0);
  if (event.seq <= sequence) return;
  client.setQueryData(key, withCodexProviderEvent(state, event));
  if (event.seq > sequence + 1 || event.kind === 'accepted' || event.kind === 'usage')
    background(
      client.invalidateQueries({ queryKey: key }, { cancelRefetch: false }),
      'queries.invalidate_failed',
    );
}

export const CODEX_PROVIDER_NOTICES = noticeHandler(
  ['ai_chat_runtime_provider'],
  ({ chat_id: chatId, event }, { client }) => {
    applyEvent(client, chatId, event);
  },
);
