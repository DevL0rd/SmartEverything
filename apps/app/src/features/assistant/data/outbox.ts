import { useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import type { AiMessageReference } from '@smarteverything/domain';
import { trimmedReferences } from '../references/spans';
import type { MessageSender } from '../components/composer';
import { Logger } from '@smarteverything/logging';
import { sendAiChatMessage } from '../../../api/ai';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';
import { clearUploads } from './uploads';

const log = new Logger('app.assistant');

export interface PendingMessage {
  readonly id: string;
  readonly chatId: string;
  readonly text: string;
  readonly attachments: readonly string[];
  readonly queuedAt: string;
  readonly references: readonly AiMessageReference[];
  readonly state: 'waiting' | 'failed';
}

const pending = new ValueStore<readonly PendingMessage[]>([]);
const sending = new ValueStore<ReadonlySet<string>>(new Set());

let flushing = false;
const delivering = new Set<string>();

export function useSendingMessage(chatId: string): boolean {
  return useValue(sending).has(chatId);
}

export function usePendingMessages(chatId: string): readonly PendingMessage[] {
  const all = useValue(pending);
  return useMemo(() => all.filter((message) => message.chatId === chatId), [all, chatId]);
}

export function usePendingCount(): number {
  return useValue(pending).length;
}

export function cancelPending(id: string): void {
  pending.update((all) => all.filter((message) => message.id !== id));
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
    state: 'waiting',
  };
  pending.update((all) => (all.some((row) => row.id === message.id) ? all : [...all, message]));
  log.info('outbox.queued', { chatId, attachments: attachments.length });
}

async function deliver(message: PendingMessage): Promise<void> {
  if (delivering.has(message.id) || !pending.get().some((row) => row.id === message.id)) return;
  delivering.add(message.id);
  try {
    await sendAiChatMessage(message.chatId, message.text, message.attachments, {
      clientMessageId: message.id,
      references: message.references,
    });
    cancelPending(message.id);
    log.info('outbox.sent', { chatId: message.chatId });
  } catch (error) {
    pending.update((all) =>
      all.map((row) => (row.id === message.id ? { ...row, state: 'failed' } : row)),
    );
    notify({ message: 'A waiting message wasn’t sent', error, tone: 'critical' });
  } finally {
    delivering.delete(message.id);
  }
}

export async function flushOutbox(): Promise<void> {
  if (flushing) {
    return;
  }
  flushing = true;
  try {
    for (const message of pending.get()) {
      if (message.state === 'waiting') await deliver(message);
    }
  } finally {
    flushing = false;
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
  try {
    await sendAiChatMessage(chatId, text, attachments, { clientMessageId: id, references });
    clearUploads();
    return true;
  } catch (error) {
    notify({ message: 'Message not sent', error, tone: 'critical' });
    return false;
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
    queue(chatId, message.text, attachments, input);
    clearUploads();
    return Promise.resolve(true);
  };
}

export async function retryPending(id: string): Promise<void> {
  const message = pending.get().find((row) => row.id === id && row.state === 'failed');
  if (message !== undefined) await deliver(message);
}
