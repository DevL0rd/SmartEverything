import type { AiChatRow, AssistantMessageRow, MessageQuote } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import type { HostStore } from '../store/host/host-store';
import { assertOrdinaryMessageKey } from './delegation/helper-receipt';
import { quoteForChat } from './message-quote';
import { ownedUploadsOf } from './owned-uploads';

export interface SendInputsRequest {
  readonly chat: AiChatRow;
  readonly profileId: string;
  readonly clientMessageId: string | undefined;
  readonly quoteMessageId: string | undefined;
  readonly attachments: readonly string[];
}

export type SendInputs =
  | { readonly known: AssistantMessageRow }
  | {
      readonly known: null;
      readonly author: string;
      readonly quote: MessageQuote | null;
      readonly files: readonly StoredAttachment[];
    };

function sendInputs(store: HostStore, input: SendInputsRequest): SendInputs {
  assertOrdinaryMessageKey(store, input.chat, input.clientMessageId);
  const known =
    input.clientMessageId === undefined
      ? undefined
      : store.assistantSearch.byClientMessageId(input.chat.id, input.clientMessageId);
  if (known !== undefined) return { known };
  return {
    known: null,
    author: store.profiles.byId(input.profileId).name,
    quote: quoteForChat(store, input.chat, input.quoteMessageId),
    files: ownedUploadsOf(store, input.profileId, input.attachments),
  };
}

export const SEND_INPUTS_UNIT = storeUnit(sendInputs);
