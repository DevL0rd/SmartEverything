import { Logger } from '@smarteverything/logging';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { NewEvent, StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import { authorityScope } from './turn-authority';

const log = new Logger('hub.assistant');

export async function queueEventSoon(
  store: Store,
  input: NewEvent,
  source?: ConversationAuthority,
  repairOrigin?: string,
): Promise<StoredEvent> {
  store.live.chatWork.holds.assertQueued(input.chat_id);
  const event = await store.host.write('assistantEventQueue', {
    event: input,
    scope: authorityScope(source, repairOrigin),
  });
  queuedLog(event, source === undefined ? 'derived' : 'given');
  return event;
}

export function queuedLog(event: StoredEvent, authoritySource: 'derived' | 'given'): void {
  log.info('request.queued', {
    eventId: event.id,
    kind: event.kind,
    chatId: event.chat_id,
    messageId: event.message_id,
    profileId: event.profile_id,
    textLength: event.text.length,
    authoritySource,
  });
}
