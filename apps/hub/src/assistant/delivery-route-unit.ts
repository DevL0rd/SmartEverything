import type { AiChatRow } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import type { ConversationAuthority } from '../harness/authority-contract';
import { storeUnit } from '../store/host/unit';
import type { HeldChats } from '../store/repositories/ai-chat-removal-hold';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { HostStore } from '../store/host/host-store';
import { checkedHelperDelivery } from './delegation/helper-delivery';
import { admitChatExecution } from './native-helpers';
import { type AuthorityScope } from './turn-authority';
import { issueEventAuthority } from './event-authority-issue';

export interface DeliveryRouteCheck {
  readonly event: StoredEvent;
  readonly held: HeldChats;
  readonly scope: AuthorityScope;
}

export type DeliveryRouteFacts =
  | { readonly ok: true; readonly chat: AiChatRow; readonly authority: ConversationAuthority }
  | { readonly ok: false; readonly reason: string };

function routeFacts(store: HostStore, input: DeliveryRouteCheck): DeliveryRouteFacts {
  const chat = store.aiChats.chat(input.event.chat_id);
  try {
    const authority = issueEventAuthority(store, input.event, input.scope);
    admitChatExecution(chat);
    checkedHelperDelivery(store, { target: chat, ...input });
    return { ok: true, chat, authority };
  } catch (cause) {
    return { ok: false, reason: messageOf(cause) };
  }
}

export const DELIVERY_ROUTE_UNIT = storeUnit(routeFacts);
