import type { PhoneFilePush } from '@smarteverything/domain';
import { ownedAttachment } from '../assistant/chat-directory';
import { chatOwnerOf, type Caller } from '../server/auth';
import type { MediaLinks } from '../server/media-links';
import type { Store } from '../store/store';

export interface PhoneFileSource {
  readonly store: Store;
  readonly links: Pick<MediaLinks, 'assistantAttachment'>;
}

export function phoneFileOf(
  source: PhoneFileSource,
  caller: Caller,
  fileId: string,
): PhoneFilePush {
  const owner = chatOwnerOf(source.store, caller);
  const file =
    owner.role === 'owner'
      ? source.store.assistantChat.attachment(fileId)
      : ownedAttachment(source.store, owner, fileId);
  return {
    type: 'receive_file',
    fileId: file.id,
    name: file.name,
    mime: file.mime,
    url: source.links.assistantAttachment(file.id).url,
  };
}
