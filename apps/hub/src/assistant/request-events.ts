import { ApiError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import type { NewEvent, StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import { authorityScope } from './turn-authority';
import { queueEventNow } from './store-units';

const log = new Logger('hub.assistant');

export function queueEvent(
  store: Store,
  input: NewEvent,
  source?: ConversationAuthority,
  repairOrigin?: string,
): StoredEvent {
  store.live.chatWork.holds.assertQueued(input.chat_id);
  const event = queueEventNow(store, { event: input, scope: authorityScope(source, repairOrigin) });
  queuedLog(event, source === undefined ? 'derived' : 'given');
  return event;
}

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

export function ownedUploads(
  store: Store,
  profileId: string,
  ids: readonly string[],
): StoredAttachment[] {
  if (new Set(ids).size !== ids.length)
    throw new ApiError('invalid_request', 'Each upload can be attached only once per message.');
  return ids.map((id) => {
    const file = store.assistantChat.attachment(id);
    if (file.profile_id !== profileId || file.message_id !== null) {
      throw new ApiError(
        'invalid_request',
        `The attachment ${id} is not an unsent upload of yours.`,
      );
    }
    return file;
  });
}
