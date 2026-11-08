import type { AiChatRow, DshSessionEvent } from '@smarteverything/domain';
import { helperInputId, projectDelivery } from '@smarteverything/harness/process';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { Store } from '../../../store/store';

interface NativeReactionInput {
  readonly chat: AiChatRow;
  readonly parent: AiChatRow;
  readonly event: StoredEvent;
  readonly authority: ConversationAuthority;
}

export function activeHelperInput(history: readonly DshSessionEvent[], eventId: string): boolean {
  const entered = history.some(
    (record) =>
      record.type === 'user/message' &&
      record.surfaceOp === 'append' &&
      helperInputId(record.data) === eventId,
  );
  if (!entered) return false;
  const projection = projectDelivery(history, eventId);
  return projection.entered && projection.end === null;
}

function issuedToSession(
  store: Store,
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

function admittedInputStart(store: Store, eventId: string, sessionId: string): number | null {
  const delivery = store.harnessDeliveries.find(eventId);
  if (
    delivery?.session_id !== sessionId ||
    delivery.state !== 'admitted' ||
    delivery.end_seq !== null
  )
    return null;
  return delivery.start_seq;
}

export function nativeHelperReactionInput(store: Store, input: NativeReactionInput): boolean {
  const { chat, parent, event } = input;
  if (chat.engine.kind !== 'dsh' || parent.engine.kind !== 'dsh') return false;
  const child = chat.engine.session_id;
  const parentSession = parent.engine.session_id;
  if (child === null || parentSession === null) return false;
  const startSeq = admittedInputStart(store, event.id, child);
  if (startSeq === null) return false;
  if (!issuedToSession(store, { child, parent: parentSession }, input)) return false;
  return activeHelperInput(
    store.dshSessions.readAll(child, chat.profile_id, { offset: startSeq }),
    event.id,
  );
}
