import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AI_CHAT_AREA_ENDPOINTS as E, ApiError, type Engine } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../../format/errors';
import { createAiChat, sendAiChatMessage } from '../../../api/ai';
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
import { aiDrafts } from '../data/ai-drafts';
import { clearSubmittedUploads } from '../data/uploads';
import {
  MACHINE_UNAVAILABLE_NOTICE,
  draftNeedsChat,
  sendFailureNotice,
  createDraftChatStarter,
  type StartOutcome,
} from '../model/draft-chat-request';
import { trimmedReferences } from '../references/spans';

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
      const chat = await authority.client.call(E.createAiChat, {
        body: { engine: selected },
      });
      assertAssistantWriteCurrent(authority);
      return chat.id;
    },
    onSettled: (): void => {
      setSendPhase(draftKey, null);
    },
    onSuccess: (chatId) => {
      if (!session.valid()) return;
      moveDraft(draftKey, chatId);
      actions.opened(chatId);
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
  readonly draftKey: string;
  readonly text: string;
  readonly attachments: readonly string[];
  readonly extras: SendExtras;
  readonly selected: Engine;
  readonly authority: AssistantWriteScope;
  readonly sessionKey: string;
}

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

function startFirstMessage(input: FirstMessage): Promise<StartOutcome> {
  const { draftKey, text, attachments, extras, selected, authority, sessionKey } = input;
  const clientMessageId = firstMessageId(input);
  const chat = draftSubmission(draftKey, clientMessageId)?.chat;
  if (chat !== undefined && chat.sessionKey !== sessionKey) {
    return Promise.resolve({
      kind: 'failed',
      stage: 'create',
      cause: new DraftSelectionChangedError(),
    });
  }
  const message = trimmedReferences({ text, references: extras.references ?? [] });
  return startDraftChat(JSON.stringify([sessionKey, clientMessageId]), {
    chatId: chat?.id ?? null,
    created: (chatId): void => {
      bindDraftSubmissionChat(draftKey, clientMessageId, { id: chatId, sessionKey });
    },
    create: async () => {
      assertAssistantWriteCurrent(authority);
      return createAiChat({ engine: selected });
    },
    send: (chatId) => {
      assertAssistantWriteCurrent(authority);
      return sendAiChatMessage(chatId, message.text, attachments, {
        ...extras,
        clientMessageId,
        references: message.references,
      });
    },
  });
}

function submittedUploadKeys(attachments: readonly string[]): readonly string[] {
  return aiDrafts
    .get()
    .uploads.filter(
      (upload) => upload.attachment !== null && attachments.includes(upload.attachment.id),
    )
    .map((upload) => upload.key);
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
    const outcome = await startFirstMessage({
      draftKey,
      text,
      attachments,
      extras,
      selected,
      authority: captureAssistantWrite(store),
      sessionKey: session.key,
    });
    if (outcome.kind === 'failed') {
      log.warn('draft_chat.start_failed', {
        stage: outcome.stage,
        reason: rawErrorText(outcome.cause),
      });
      setFailure(failureText(selected, outcome.cause, host));
      return false;
    }
    clearSubmittedUploads(uploadKeys);
    if (session.valid()) openSentChat(outcome.chatId, actions.opened);
    return true;
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
