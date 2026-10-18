import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AI_CHAT_AREA_ENDPOINTS as E, NEW_CHAT_TITLE, type Engine } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../../format/errors';
import { createAiChat, removeAiChat, sendAiChatMessage } from '../../../api/ai';
import { useEntityStore } from '../../../store/store-context';
import {
  captureAssistantWrite,
  assertAssistantWriteCurrent,
} from '../../../store/assistant-response-style';
import { usePickerSession } from '../picker/model-search-session';
import { useDraftSelected, moveDraft } from '../data/drafts';
import type { MessageSender } from '../components/composer';
import { clearUploads } from '../data/uploads';
import {
  MACHINE_UNAVAILABLE_NOTICE,
  draftNeedsChat,
  sendFailureNotice,
  startChatWithMessage,
} from '../model/draft-chat-request';
import { trimmedReferences } from '../references/spans';

const log = new Logger('app.draft-chat');

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
  const requested = useDraftSelected(draftKey, (text) => draftNeedsChat(engine, text));
  const mutation = useMutation({
    mutationFn: async (): Promise<string | null> => {
      const authority = captureAssistantWrite(store);
      assertAssistantWriteCurrent(authority);
      const selected = actions.resolve();
      if (selected === null) return null;
      const chat = await authority.client.call(E.createAiChat, {
        body: { title: NEW_CHAT_TITLE, engine: selected },
      });
      assertAssistantWriteCurrent(authority);
      return chat.id;
    },
    onSuccess: (chatId) => {
      if (chatId === null || !session.valid()) return;
      moveDraft(draftKey, chatId);
      actions.opened(chatId);
    },
  });
  return {
    requested,
    pending: mutation.isPending,
    problem: mutation.isError ? 'Couldn’t start the chat. Try again.' : null,
    start: (): void => {
      mutation.mutate();
    },
  };
}

export interface DraftSender {
  readonly send: MessageSender;
  readonly failure: string | null;
}

async function removeEmptyChat(chatId: string): Promise<void> {
  try {
    await removeAiChat(chatId);
  } catch (error) {
    log.warn('draft_chat.empty_chat_not_removed', { chatId, reason: rawErrorText(error) });
  }
}

export function useDraftSender(
  host: string,
  actions: { readonly resolve: () => Engine | null; readonly opened: (chatId: string) => void },
): DraftSender {
  const [failure, setFailure] = useState<string | null>(null);
  const send: MessageSender = async (text, attachments, references = [], clientMessageId) => {
    setFailure(null);
    const selected = actions.resolve();
    if (selected === null) {
      setFailure(MACHINE_UNAVAILABLE_NOTICE);
      return false;
    }
    const message = trimmedReferences({ text, references });
    const outcome = await startChatWithMessage({
      create: () => createAiChat({ title: NEW_CHAT_TITLE, engine: selected }),
      send: (chatId) =>
        sendAiChatMessage(chatId, message.text, attachments, {
          references: message.references,
          ...(clientMessageId === undefined ? {} : { clientMessageId }),
        }),
      remove: removeEmptyChat,
    });
    if (outcome.kind === 'failed') {
      log.warn('draft_chat.start_failed', {
        stage: outcome.stage,
        reason: rawErrorText(outcome.cause),
      });
      setFailure(sendFailureNotice(host));
      return false;
    }
    clearUploads();
    actions.opened(outcome.chatId);
    return true;
  };
  return { send, failure };
}
