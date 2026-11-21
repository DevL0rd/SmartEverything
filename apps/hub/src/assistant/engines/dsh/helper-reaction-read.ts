import type { AiChatRow, DshSessionEvent } from '@smarteverything/domain';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { HostStore } from '../../../store/host/host-store';
import { storeUnit } from '../../../store/host/unit';

export interface NativeReactionInput {
  readonly chat: AiChatRow;
  readonly parent: AiChatRow;
  readonly event: StoredEvent;
  readonly authority: ConversationAuthority;
}

function issuedToSession(
  store: HostStore,
  identity: { readonly child: string; readonly parent: string },
  { chat, authority }: NativeReactionInput,
): boolean {
  const metadata = store.dshSessions.stat(identity.child, chat.profile_id);
  if (
    metadata?.chat_id !== chat.id ||
    metadata.header.origin !== 'subagent' ||
    metadata.header.parentSession !== identity.parent
  )
    return false;
  const adopted = store.aiAgentRuns.currentOfSession(identity.child);
  const grant = store.harnessSessions.grant(identity.child);
  return adopted?.source_id === authority.event_id && grant?.event_id === authority.event_id;
}

function admittedInputStart(store: HostStore, eventId: string, sessionId: string): number | null {
  const delivery = store.harnessDeliveries.find(eventId);
  if (
    delivery?.session_id !== sessionId ||
    delivery.state !== 'admitted' ||
    delivery.end_seq !== null
  )
    return null;
  return delivery.start_seq;
}

export const HELPER_REACTION_READ_UNIT = storeUnit(
  (store, input: NativeReactionInput): DshSessionEvent[] | null => {
    const { chat, parent, event } = input;
    if (chat.engine.kind !== 'dsh' || parent.engine.kind !== 'dsh') return null;
    const child = chat.engine.session_id;
    const parentSession = parent.engine.session_id;
    if (child === null || parentSession === null) return null;
    const startSeq = admittedInputStart(store, event.id, child);
    if (startSeq === null) return null;
    if (!issuedToSession(store, { child, parent: parentSession }, input)) return null;
    return store.dshSessions.readAll(child, chat.profile_id, { offset: startSeq });
  },
);
