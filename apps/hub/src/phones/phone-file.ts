import type { PhoneFilePush } from '@smarteverything/domain';
import { chatOwnerOf, type Caller } from '../server/auth';
import type { MediaLinks } from '../server/media-links';
import type { Store } from '../store/store';

export interface PhoneFileSource {
  readonly store: Store;
  readonly links: Pick<MediaLinks, 'assistantAttachment'>;
}

export async function phoneFileOf(
  source: PhoneFileSource,
  caller: Caller,
  fileId: string,
): Promise<PhoneFilePush> {
  const owner = chatOwnerOf(caller);
  const file = await source.store.host.read('mcpReadableAttachment', { owner, id: fileId });
  return {
    type: 'receive_file',
    fileId: file.id,
    name: file.name,
    mime: file.mime,
    url: source.links.assistantAttachment(file.id).url,
  };
}
