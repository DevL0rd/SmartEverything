import { ApiError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import { eventAuthority } from './turn-authority';

const log = new Logger('hub.assistant');

export function queueEvent(
  store: Store,
  input: Parameters<Store['assistantEvents']['add']>[0],
  source?: ConversationAuthority,
): StoredEvent {
  return store.write(() => {
    const event = store.assistantEvents.add(input);
    eventAuthority(store, event, source);
    log.info('request.queued', {
      eventId: event.id,
      kind: event.kind,
      chatId: event.chat_id,
      messageId: event.message_id,
      profileId: event.profile_id,
      textLength: event.text.length,
      authoritySource: source === undefined ? 'derived' : 'given',
    });
    return event;
  });
}

export function ownedUploads(
  store: Store,
  profileId: string,
  ids: readonly string[],
): StoredAttachment[] {
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
