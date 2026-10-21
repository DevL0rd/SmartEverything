import { useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import type { AiMessageReference } from '@smarteverything/domain';
import { trimmedReferences } from '../references/spans';
import type { MessageSender } from '../components/composer';
import { Logger, background } from '@smarteverything/logging';
import { sendAiChatMessage } from '../../../api/ai';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';
import { aiDrafts, patchAiDrafts, useAiDrafts, type PendingMessage } from './ai-drafts';
import { clearUploads } from './uploads';
import { compareText } from '../../../format/text';

const log = new Logger('app.assistant');

export type { PendingMessage };

const sending = new ValueStore<ReadonlySet<string>>(new Set());

export const OUTBOX_RETRY_MS = 2000;

let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(): void {
  retryTimer ??= setTimeout(() => {
    retryTimer = null;
    background(flushOutbox(), 'outbox.retry_failed');
  }, OUTBOX_RETRY_MS);
}

function stopRetry(): void {
  if (retryTimer === null) return;
  clearTimeout(retryTimer);
  retryTimer = null;
}

const delivering = new ValueStore<ReadonlySet<string>>(new Set());

function startDelivery(id: string): void {
  delivering.update((all) => new Set([...all, id]));
}

function endDelivery(id: string): void {
  delivering.update((all) => new Set([...all].filter((entry) => entry !== id)));
}

export function useDeliveringMessages(): ReadonlySet<string> {
  return useValue(delivering);
}

export function useSendingMessage(chatId: string): boolean {
  return useValue(sending).has(chatId);
}

export function usePendingMessages(chatId: string): readonly PendingMessage[] {
  const all = useAiDrafts((state) => state.outbox);
  return useMemo(() => all.filter((message) => message.chatId === chatId), [all, chatId]);
}

export function usePendingCount(): number {
  return useAiDrafts((state) => state.outbox.length);
}

export function cancelPending(id: string): void {
  log.debug('outbox.cancelled', { messageId: id });
  patchAiDrafts('outbox', (all) => all.filter((message) => message.id !== id));
  if (aiDrafts.get().outbox.length === 0) stopRetry();
}

export function removePending(message: PendingMessage): void {
  log.info('outbox.removed', { chatId: message.chatId, messageId: message.id });
  cancelPending(message.id);
  notify({
    message: 'Removed from Waiting for connection',
    undo: (): void => {
      patchAiDrafts('outbox', (all) =>
        all.some((row) => row.id === message.id)
          ? all
          : [...all, message].sort((left, right) => compareText(left.queuedAt, right.queuedAt)),
      );
    },
  });
}

function queue(
  chatId: string,
  text: string,
  attachments: readonly string[],
  input: { readonly references: readonly AiMessageReference[]; readonly id: string },
): void {
  const message: PendingMessage = {
    id: input.id,
    chatId,
    text,
    attachments,
    queuedAt: new Date().toISOString(),
    references: input.references,
  };
  patchAiDrafts('outbox', (all) =>
    all.some((row) => row.id === message.id) ? all : [...all, message],
  );
  log.info('outbox.queued', { chatId, attachments: attachments.length });
}

async function deliver(message: PendingMessage): Promise<boolean> {
  if (
    delivering.get().has(message.id) ||
    !aiDrafts.get().outbox.some((row) => row.id === message.id)
  ) {
    log.debug('outbox.delivery_skipped', { chatId: message.chatId, messageId: message.id });
    return true;
  }
  startDelivery(message.id);
  const startedAt = Date.now();
  log.debug('outbox.delivering', {
    chatId: message.chatId,
    messageId: message.id,
    attachments: message.attachments.length,
    queuedAt: message.queuedAt,
  });
  try {
    await sendAiChatMessage(message.chatId, message.text, message.attachments, {
      clientMessageId: message.id,
      references: message.references,
    });
    cancelPending(message.id);
    log.info('outbox.sent', {
      chatId: message.chatId,
      messageId: message.id,
      durationMs: Date.now() - startedAt,
    });
    return true;
  } catch (error) {
    log.error('outbox.delivery_failed', error, {
      chatId: message.chatId,
      messageId: message.id,
      durationMs: Date.now() - startedAt,
    });
    return false;
  } finally {
    endDelivery(message.id);
  }
}

function nextDeliverable(held: ReadonlySet<string>): PendingMessage | undefined {
  const blocked = new Set(held);
  for (const message of aiDrafts.get().outbox) {
    if (delivering.get().has(message.id)) blocked.add(message.chatId);
    else if (!blocked.has(message.chatId)) return message;
  }
  return undefined;
}

export async function flushOutbox(): Promise<void> {
  if (flushing) {
    log.debug('outbox.flush_skipped', { reason: 'already-flushing' });
    return;
  }
  flushing = true;
  const pending = aiDrafts.get().outbox.length;
  if (pending > 0) log.info('outbox.flush_started', { pending });
  const held = new Set<string>();
  try {
    for (let next = nextDeliverable(held); next !== undefined; next = nextDeliverable(held)) {
      if (!(await deliver(next))) held.add(next.chatId);
    }
  } finally {
    flushing = false;
    if (held.size > 0) scheduleRetry();
    if (pending > 0)
      log.debug('outbox.flush_finished', () => ({ remaining: aiDrafts.get().outbox.length }));
  }
}

async function sendNow(
  chatId: string,
  text: string,
  attachments: readonly string[],
  input: { readonly references: readonly AiMessageReference[]; readonly id: string },
): Promise<boolean> {
  const { references, id } = input;
  sending.update((all) => new Set([...all, chatId]));
  const operation = log.operation('chat_message.send', {
    chatId,
    clientMessageId: id,
    length: text.length,
    attachments: attachments.length,
    references: references.length,
  });
  try {
    await sendAiChatMessage(chatId, text, attachments, { clientMessageId: id, references });
    clearUploads();
    operation.succeeded();
    return true;
  } catch (error) {
    operation.failed(error);
    queue(chatId, text, attachments, input);
    clearUploads();
    scheduleRetry();
    return true;
  } finally {
    sending.update((all) => new Set([...all].filter((id) => id !== chatId)));
  }
}

export function outboxSender(chatId: string, online: boolean): MessageSender {
  return (text, attachments, references = [], clientMessageId) => {
    const message = trimmedReferences({ text, references });
    const input = { references: message.references, id: clientMessageId ?? randomUUID() };
    if (online) {
      return sendNow(chatId, message.text, attachments, input);
    }
    log.info('outbox.offline_queue', { chatId, clientMessageId: input.id });
    queue(chatId, message.text, attachments, input);
    clearUploads();
    return Promise.resolve(true);
  };
}
