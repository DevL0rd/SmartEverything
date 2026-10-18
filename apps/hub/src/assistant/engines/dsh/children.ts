import { randomUUID } from 'node:crypto';
import { DSH_SESSION_ID } from '@smarteverything/domain';
import type { Store } from '../../../store/store';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { AiChatRow } from '@smarteverything/domain';
export function bindNativeChild(
  store: Store,
  event: StoredEvent,
  chat: AiChatRow,
  session: string,
): void {
  const run = store.aiAgentRuns.find(event.id);
  if (run?.source !== 'smarteverything' || chat.parent_id === null || chat.engine.kind !== 'dsh')
    return;
  const parent = store.aiChats.chat(chat.parent_id);
  if (parent.engine.kind !== 'dsh' || parent.engine.session_id === null) return;
  const writer = store.dshSessions.attached(session, event.profile_id);
  if (writer === null) throw new Error('Admitted child lost its native writer.');
  const prior = store.harnessChildren.find(event.id);
  const delivery = prior?.delivery_id ?? randomUUID();
  store.harnessChildren.keep({
    operation_id: event.id,
    parent_session: parent.engine.session_id,
    child_session: session,
    run_id: run.id,
    delivery_id: delivery,
    state: 'running',
    result: null,
    delivered: 0,
  });
  store.aiAgentRuns.upsert({
    ...run,
    source_seq: run.source_seq + 1,
    harness: {
      session_id: DSH_SESSION_ID.parse(session),
      parent_session_id: parent.engine.session_id,
      target: writer.target,
      model_route_id: chat.engine.model_route_id,
      permission: chat.engine.permission,
      operation_id: event.id,
      parent_delivery_id: delivery,
      writer_epoch: writer.epoch,
    },
  });
}
