import { useMemo } from 'react';
import { ApiError, type AssistantMessageRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ValueStore, useValue } from '../../../design/external-store';
import { rawErrorText } from '../../../format/errors';
import type { PendingMessage } from './ai-drafts';

const log = new Logger('app.assistant');

export type OutgoingPhase =
  | { readonly phase: 'sending' }
  | { readonly phase: 'sent' }
  | { readonly phase: 'failed'; readonly error: string };

export type OutgoingMessage = PendingMessage & OutgoingPhase;

export type UnsentMessage = PendingMessage & ({ readonly phase: 'queued' } | OutgoingPhase);

const TRANSIENT_REFUSALS: ReadonlySet<ApiError['code']> = new Set(['hub_starting', 'rate_limited']);

const outgoing = new ValueStore<readonly OutgoingMessage[]>([]);

export function refusedByHub(error: unknown): error is ApiError {
  return error instanceof ApiError && !TRANSIENT_REFUSALS.has(error.code);
}

export function pendingOf(message: PendingMessage): PendingMessage {
  const { id, chatId, text, attachments, queuedAt, references, quoteMessageId } = message;
  return {
    id,
    chatId,
    text,
    attachments,
    queuedAt,
    references,
    ...(quoteMessageId === undefined ? {} : { quoteMessageId }),
  };
}

function withPhase(message: PendingMessage, phase: OutgoingPhase): OutgoingMessage {
  return { ...pendingOf(message), ...phase };
}

export function markOutgoing(message: PendingMessage, phase: OutgoingPhase): void {
  const next = withPhase(message, phase);
  outgoing.update((all) =>
    all.some((row) => row.id === message.id)
      ? all.map((row) => (row.id === message.id ? next : row))
      : [...all, next],
  );
}

export function failOutgoing(message: PendingMessage, error: unknown): void {
  log.warn('outgoing.refused', {
    chatId: message.chatId,
    messageId: message.id,
    reason: rawErrorText(error),
  });
  markOutgoing(message, { phase: 'failed', error: rawErrorText(error) });
}

export function dropOutgoing(id: string): void {
  outgoing.update((all) =>
    all.some((row) => row.id === id) ? all.filter((row) => row.id !== id) : all,
  );
}

export function outgoingMessage(id: string): OutgoingMessage | undefined {
  return outgoing.get().find((row) => row.id === id);
}

export function hasSentOutgoing(): boolean {
  return outgoing.get().some((row) => row.phase === 'sent');
}

export function subscribeOutgoing(listener: () => void): () => void {
  return outgoing.subscribe(listener);
}

export function settleOutgoing(
  stored: readonly Pick<AssistantMessageRow, 'client_message_id'>[],
): void {
  const sent = outgoing.get().filter((row) => row.phase === 'sent');
  if (sent.length === 0) return;
  const known = new Set(
    stored.flatMap((row) => (row.client_message_id === null ? [] : [row.client_message_id])),
  );
  const settled = sent.filter((row) => known.has(row.id));
  if (settled.length === 0) return;
  log.debug('outgoing.settled', { messages: settled.length });
  const ids = new Set(settled.map((row) => row.id));
  outgoing.update((all) => all.filter((row) => !ids.has(row.id)));
}

export function useOutgoingMessages(chatId: string): readonly OutgoingMessage[] {
  const all = useValue(outgoing);
  return useMemo(() => all.filter((message) => message.chatId === chatId), [all, chatId]);
}
