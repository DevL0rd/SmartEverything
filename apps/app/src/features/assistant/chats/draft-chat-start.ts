import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { AI_CHAT_AREA_ENDPOINTS as E, ApiError, type Engine } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../../format/errors';
import { createAiChat, sendAiChatMessage } from '../../../api/ai';
import { notify } from '../../../components/toast-store';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
import {
  captureAssistantWrite,
  assertAssistantWriteCurrent,
  type AssistantWriteScope,
} from '../../../store/assistant-response-style';
import { beginSend, setSendPhase, useSendPhase } from '../components/send-phase';
import { usePickerSession } from '../picker/model-search-session';
import {
  bindDraftSubmissionChat,
  captureDraftSubmission,
  draftSubmission,
  useDraftSelected,
  moveDraft,
} from '../data/drafts';
import type { MessageSender, SendExtras } from '../components/composer';
import { aiDrafts, type PendingMessage } from '../data/ai-drafts';
import { clearSubmittedUploads } from '../data/uploads';
import { deliverUnsent } from '../data/outbox';
import { dropOutgoing, markOutgoing } from '../data/outgoing';
import {
  MACHINE_UNAVAILABLE_NOTICE,
  draftNeedsChat,
  sendFailureNotice,
  createDraftChatStarter,
  type StartOutcome,
} from '../model/draft-chat-request';
import { trimmedReferences } from '../references/spans';
import { createStartedChat } from './started-chat';

const log = new Logger('app.draft-chat');
const startDraftChat = createDraftChatStarter();

class DraftSelectionChangedError extends Error {
  override readonly name = 'DraftSelectionChangedError';
  constructor() {
    super('Couldn’t start the chat. Choose the engine again.');
  }
}

function startProblem(error: Error | null): string | null {
  if (error === null) return null;
  if (error instanceof DraftSelectionChangedError || error instanceof ApiError)
    return error.message;
  return 'Couldn’t start the chat. Try again.';
}

export interface DraftChatStart {
  readonly requested: boolean;
  readonly pending: boolean;
  readonly problem: string | null;
  readonly start: () => void;
}

export function useDraftChatStart(
  draftKey: string,
  engine: Engine | null,
  actions: { readonly resolve: () => Engine | null; readonly opened: (chatId: string) => void },
): DraftChatStart {
  const store = useEntityStore();
  const session = usePickerSession();
  const phase = useSendPhase(draftKey);
  const requested = useDraftSelected(draftKey, (text) => draftNeedsChat(engine, text));
  const mutation = useMutation({
    mutationFn: async (): Promise<string> => {
      const selected = session.valid() ? actions.resolve() : null;
      if (selected === null) throw new DraftSelectionChangedError();
      const authority = captureAssistantWrite(store);
      assertAssistantWriteCurrent(authority);
      const chatId = randomUUID();
      const created = createStartedChat({
        store,
        chatId,
        engine: selected,
        create: async () => {
          assertAssistantWriteCurrent(authority);
          return authority.client.call(E.createAiChat, { body: { id: chatId, engine: selected } });
        },
      });
      moveDraft(draftKey, chatId);
      actions.opened(chatId);
      try {
        await created;
      } catch (error) {
        moveDraft(chatId, draftKey);
        notify({ message: 'Chat not created', error, tone: 'critical' });
        throw error;
      }
      return chatId;
    },
    onSettled: (): void => {
      setSendPhase(draftKey, null);
    },
  });
  return {
    requested,
    pending: mutation.isPending || phase === 'sending',
    problem: startProblem(mutation.error),
    start: (): void => {
      if (!beginSend(draftKey)) return;
      mutation.mutate();
    },
  };
}

export interface DraftSender {
  readonly send: MessageSender;
  readonly failure: string | null;
}

function failureText(selected: Engine, cause: unknown, host: string): string {
  return selected.kind !== 'dsh' && cause instanceof ApiError
    ? cause.message
    : sendFailureNotice(host);
}

interface FirstMessage {
  readonly store: EntityStore;
  readonly draftKey: string;
  readonly text: string;
  readonly attachments: readonly string[];
  readonly extras: SendExtras;
  readonly selected: Engine;
  readonly authority: AssistantWriteScope;
  readonly sessionKey: string;
}

type FirstSend =
  | { readonly kind: 'stale' }
  | {
      readonly kind: 'started';
      readonly message: PendingMessage;
      readonly outcome: Promise<StartOutcome>;
    };

function firstMessageId(input: FirstMessage): string {
  const { draftKey, text, attachments, extras } = input;
  return (
    extras.clientMessageId ??
    captureDraftSubmission(draftKey, {
      text,
      attachments,
      references: extras.references ?? [],
      quoteMessageId: extras.quoteMessageId,
    }).id
  );
}

function firstMessageChat(
  draftKey: string,
  clientMessageId: string,
  sessionKey: string,
): string | null {
  const chat = draftSubmission(draftKey, clientMessageId)?.chat;
  if (chat !== undefined) return chat.sessionKey === sessionKey ? chat.id : null;
  const id = randomUUID();
  bindDraftSubmissionChat(draftKey, clientMessageId, { id, sessionKey });
  return id;
}

function startFirstMessage(input: FirstMessage): FirstSend {
  const { store, draftKey, attachments, extras, selected, authority, sessionKey } = input;
  const clientMessageId = firstMessageId(input);
  const chatId = firstMessageChat(draftKey, clientMessageId, sessionKey);
  if (chatId === null) return { kind: 'stale' };
  const trimmed = trimmedReferences({ text: input.text, references: extras.references ?? [] });
  const message: PendingMessage = {
    id: clientMessageId,
    chatId,
    text: trimmed.text,
    attachments,
    queuedAt: new Date().toISOString(),
    references: trimmed.references,
    ...(extras.quoteMessageId === undefined ? {} : { quoteMessageId: extras.quoteMessageId }),
  };
  const outcome = startDraftChat(JSON.stringify([sessionKey, clientMessageId]), {
    chatId,
    create: () =>
      createStartedChat({
        store,
        chatId,
        engine: selected,
        create: async () => {
          assertAssistantWriteCurrent(authority);
          return createAiChat({ id: chatId, engine: selected });
        },
      }),
    send: () => {
      assertAssistantWriteCurrent(authority);
      return sendAiChatMessage(chatId, message.text, attachments, {
        ...extras,
        clientMessageId,
        references: message.references,
      });
    },
  });
  return { kind: 'started', message, outcome };
}

function submittedUploadKeys(attachments: readonly string[]): readonly string[] {
  return aiDrafts
    .get()
    .uploads.filter(
      (upload) => upload.attachment !== null && attachments.includes(upload.attachment.id),
    )
    .map((upload) => upload.key);
}

function settleFirstMessage(
  outcome: StartOutcome,
  message: PendingMessage,
  uploadKeys: readonly string[],
): void {
  if (outcome.kind === 'sent') {
    markOutgoing(message, { phase: 'sent' });
    clearSubmittedUploads(uploadKeys);
    return;
  }
  log.warn('draft_chat.start_failed', {
    stage: outcome.stage,
    chatId: outcome.chatId,
    reason: rawErrorText(outcome.cause),
  });
  if (outcome.stage === 'send') {
    clearSubmittedUploads(uploadKeys);
    deliverUnsent(message, outcome.cause);
    return;
  }
  dropOutgoing(message.id);
  notify({ message: 'Chat not created', error: outcome.cause, tone: 'critical' });
}

export function useDraftSender(
  draftKey: string,
  host: string,
  actions: { readonly resolve: () => Engine | null; readonly opened: (chatId: string) => void },
): DraftSender {
  const store = useEntityStore();
  const session = usePickerSession();
  const [failure, setFailure] = useState<string | null>(null);
  const send: MessageSender = async (text, attachments, extras = {}) => {
    setFailure(null);
    const selected = session.valid() ? actions.resolve() : null;
    if (selected === null) {
      setFailure(MACHINE_UNAVAILABLE_NOTICE);
      return false;
    }
    const uploadKeys = submittedUploadKeys(attachments);
    const first = startFirstMessage({
      store,
      draftKey,
      text,
      attachments,
      extras,
      selected,
      authority: captureAssistantWrite(store),
      sessionKey: session.key,
    });
    if (first.kind === 'stale') {
      setFailure(failureText(selected, new DraftSelectionChangedError(), host));
      return false;
    }
    markOutgoing(first.message, { phase: 'sending' });
    if (session.valid()) openSentChat(first.message.chatId, actions.opened);
    const outcome = await first.outcome;
    settleFirstMessage(outcome, first.message, uploadKeys);
    if (outcome.kind === 'sent' || outcome.stage === 'send') return true;
    setFailure(failureText(selected, outcome.cause, host));
    return false;
  };
  return { send, failure };
}

function openSentChat(chatId: string, opened: (chatId: string) => void): void {
  try {
    opened(chatId);
  } catch (error) {
    log.warn('draft_chat.open_failed', { chatId, reason: rawErrorText(error) });
  }
}
