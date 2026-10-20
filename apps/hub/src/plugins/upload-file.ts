import { readFile } from 'node:fs/promises';
import type { AssistantFiles } from '../assistant/files';
import type { Store } from '../store/store';
import type { PluginFiles } from './builtin/contract';

export function uploadFileReader(ports: {
  readonly store: Pick<Store, 'assistantChat'>;
  readonly files: Pick<AssistantFiles, 'pathOf'>;
}): PluginFiles['fromUpload'] {
  return async (caller, uploadId) => {
    const file = ports.store.assistantChat.attachment(uploadId);
    if (caller.role !== 'owner' && file.profile_id !== caller.profileId) return null;
    return { data: await readFile(ports.files.pathOf(file)), name: file.name };
  };
}
