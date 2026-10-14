import { useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
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
}

const pending = new ValueStore<readonly PendingMessage[]>([]);
const sending = new ValueStore<ReadonlySet<string>>(new Set());

let flushing = false;

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

function queue(chatId: string, text: string, attachments: readonly string[]): void {
  const message: PendingMessage = {
    id: randomUUID(),
    chatId,
    text,
    attachments,
    queuedAt: new Date().toISOString(),
  };
  pending.update((all) => [...all, message]);
  log.info('outbox.queued', { chatId, attachments: attachments.length });
}

async function deliver(message: PendingMessage): Promise<void> {
  try {
    await sendAiChatMessage(message.chatId, message.text, message.attachments, message.id);
    cancelPending(message.id);
    log.info('outbox.sent', { chatId: message.chatId });
  } catch (error) {
    cancelPending(message.id);
    notify({ message: 'A waiting message wasn’t sent', error, tone: 'critical' });
  }
}

export async function flushOutbox(): Promise<void> {
  if (flushing) {
    return;
  }
  flushing = true;
  try {
    for (const message of pending.get()) {
      await deliver(message);
    }
  } finally {
    flushing = false;
  }
}

async function sendNow(
  chatId: string,
  text: string,
  attachments: readonly string[],
): Promise<boolean> {
  sending.update((all) => new Set([...all, chatId]));
  try {
    await sendAiChatMessage(chatId, text, attachments, randomUUID());
    clearUploads();
    return true;
  } catch (error) {
    notify({ message: 'Message not sent', error, tone: 'critical' });
    return false;
  } finally {
    sending.update((all) => new Set([...all].filter((id) => id !== chatId)));
  }
}

export function outboxSender(
  chatId: string,
  online: boolean,
): (text: string, attachments: readonly string[]) => Promise<boolean> {
  return (text, attachments) => {
    if (online) {
      return sendNow(chatId, text.trim(), attachments);
    }
    queue(chatId, text.trim(), attachments);
    clearUploads();
    return Promise.resolve(true);
  };
}
