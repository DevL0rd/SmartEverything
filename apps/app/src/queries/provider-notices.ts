import type { QueryClient } from '@tanstack/react-query';
import type { AiChatProvider, ProviderEvent } from '@smarteverything/domain';
import { providerKey } from './keys';
import { providerSequence, withProviderEvent } from './provider-events';
import { runningRead } from './running-read';
import { noticeHandler } from '../store/notice-registry';
import { background } from '@smarteverything/logging';

function isTaskNotice(event: ProviderEvent): boolean {
  if (event.kind !== 'runtime') return false;
  const subtype = event.payload['subtype'];
  return (
    event.type.startsWith('task_') ||
    (typeof subtype === 'string' &&
      (subtype.startsWith('task_') || subtype === 'background_tasks_changed'))
  );
}

function needsSnapshot(event: ProviderEvent): boolean {
  return (
    event.kind === 'accepted' || (event.kind === 'runtime' && event.type === 'rate_limit_event')
  );
}

function stateKey(chatId: string): readonly string[] {
  return [...providerKey(chatId), 'state'];
}

function applyEvent(
  client: QueryClient,
  chatId: string,
  event: ProviderEvent,
  retryOtherJob = true,
): void {
  const key = stateKey(chatId);
  const state = client.getQueryData<AiChatProvider>(key);
  const running = runningRead(client, key);
  if (running) {
    const again = (): void => {
      applyEvent(client, chatId, event, retryOtherJob);
    };
    background(running.then(again, again), 'provider_notices.background_failed');
    return;
  }
  if (state?.job_id !== event.job_id) {
    const reread = client.invalidateQueries(
      { queryKey: key, exact: true },
      { cancelRefetch: false },
    );
    if (retryOtherJob)
      background(
        reread.then(() => {
          applyEvent(client, chatId, event, false);
        }),
        'provider_notices.background_failed',
      );
    return;
  }
  const sequence = providerSequence(state, event.job_id);
  if (event.seq <= sequence) return;
  client.setQueryData(key, withProviderEvent(state, event));
  if ((sequence > 0 && event.seq > sequence + 1) || needsSnapshot(event))
    background(
      client.invalidateQueries({ queryKey: key, exact: true }, { cancelRefetch: false }),
      'queries.invalidate_failed',
    );
}

export const PROVIDER_NOTICES = noticeHandler(
  ['ai_chat_provider'],
  ({ chat_id: chatId, event }, { client }) => {
    applyEvent(client, chatId, event);
    if (isTaskNotice(event))
      background(
        client.invalidateQueries(
          { queryKey: [...providerKey(chatId), 'read'] },
          { cancelRefetch: false },
        ),
        'queries.invalidate_failed',
      );
  },
);
