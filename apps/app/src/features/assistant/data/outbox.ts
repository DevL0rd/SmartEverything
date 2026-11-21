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
import {
  dropOutgoing,
  failOutgoing,
  markOutgoing,
  outgoingMessage,
  pendingOf,
  refusedByHub,
  useOutgoingMessages,
} from './outgoing';

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

function startDelivery(message: PendingMessage): void {
  markOutgoing(message, { phase: 'sending' });
  delivering.update((all) => new Set([...all, message.id]));
  sending.update((all) => new Set([...all, message.chatId]));
}

function endDelivery(message: PendingMessage): void {
  delivering.update((all) => new Set([...all].filter((entry) => entry !== message.id)));
  sending.update((all) => new Set([...all].filter((entry) => entry !== message.chatId)));
}

export function useDeliveringMessages(): ReadonlySet<string> {
  return useValue(delivering);
}

export function useSendingMessage(chatId: string): boolean {
  return useValue(sending).has(chatId);
}

export function usePendingMessages(chatId: string): readonly PendingMessage[] {
  const all = useAiDrafts((state) => state.outbox);
  const tracked = useOutgoingMessages(chatId);
  return useMemo(() => {
    const ids = new Set(tracked.map((message) => message.id));
    return all.filter((message) => message.chatId === chatId && !ids.has(message.id));
  }, [all, tracked, chatId]);
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

interface SendInput {
  readonly references: readonly AiMessageReference[];
  readonly id: string;
  readonly quoteMessageId?: string | undefined;
}

function pendingMessage(
  chatId: string,
  text: string,
  attachments: readonly string[],
  input: SendInput,
): PendingMessage {
  return {
    id: input.id,
    chatId,
    text,
    attachments,
    queuedAt: new Date().toISOString(),
    references: input.references,
    ...(input.quoteMessageId === undefined ? {} : { quoteMessageId: input.quoteMessageId }),
  };
}

function queue(message: PendingMessage): void {
  patchAiDrafts('outbox', (all) =>
    all.some((row) => row.id === message.id) ? all : [...all, message],
  );
  log.info('outbox.queued', { chatId: message.chatId, attachments: message.attachments.length });
}

function deliveryOf(message: PendingMessage): Promise<unknown> {
  return sendAiChatMessage(message.chatId, message.text, message.attachments, {
    clientMessageId: message.id,
    references: message.references,
    ...(message.quoteMessageId === undefined ? {} : { quoteMessageId: message.quoteMessageId }),
  });
}

function refused(message: PendingMessage, error: unknown): void {
  failOutgoing(message, error);
  notify({ message: 'Message not sent', error, tone: 'critical' });
}

async function deliver(message: PendingMessage): Promise<boolean> {
  if (
    delivering.get().has(message.id) ||
    !aiDrafts.get().outbox.some((row) => row.id === message.id)
  ) {
    log.debug('outbox.delivery_skipped', { chatId: message.chatId, messageId: message.id });
    return true;
  }
  startDelivery(message);
  const startedAt = Date.now();
  log.debug('outbox.delivering', {
    chatId: message.chatId,
    messageId: message.id,
    attachments: message.attachments.length,
    queuedAt: message.queuedAt,
  });
  try {
    await deliveryOf(message);
    markOutgoing(message, { phase: 'sent' });
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
    if (!refusedByHub(error)) {
      dropOutgoing(message.id);
      return false;
    }
    cancelPending(message.id);
    refused(message, error);
    return true;
  } finally {
    endDelivery(message);
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

function sendNow(message: PendingMessage): void {
  queue(message);
  background(flushOutbox(), 'outbox.flush_failed');
}

export function deliverUnsent(message: PendingMessage, error: unknown): void {
  if (refusedByHub(error)) {
    refused(message, error);
    return;
  }
  log.info('outbox.unsent_queued', { chatId: message.chatId, messageId: message.id });
  dropOutgoing(message.id);
  sendNow(message);
}

export function retryOutgoing(id: string): void {
  const message = outgoingMessage(id);
  if (message?.phase !== 'failed') {
    log.debug('outgoing.retry_skipped', { messageId: id });
    return;
  }
  log.info('outgoing.retried', { chatId: message.chatId, messageId: id });
  queue(pendingOf(message));
  dropOutgoing(id);
  background(flushOutbox(), 'outbox.flush_failed');
}

export function removeOutgoing(id: string): void {
  log.info('outgoing.removed', { messageId: id });
  dropOutgoing(id);
}

export function outboxSender(chatId: string, online: boolean): MessageSender {
  return (text, attachments, extras = {}) => {
    const { references = [], clientMessageId, quoteMessageId } = extras;
    const trimmed = trimmedReferences({ text, references });
    const message = pendingMessage(chatId, trimmed.text, attachments, {
      references: trimmed.references,
      id: clientMessageId ?? randomUUID(),
      quoteMessageId,
    });
    clearUploads();
    if (online) sendNow(message);
    else {
      log.info('outbox.offline_queue', { chatId, clientMessageId: message.id });
      queue(message);
    }
    return Promise.resolve(true);
  };
}
