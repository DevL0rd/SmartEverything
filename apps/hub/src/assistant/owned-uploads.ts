import { ApiError } from '@smarteverything/domain';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import type { HostStore } from '../store/host/host-store';

export function ownedUploadsOf(
  store: HostStore,
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
