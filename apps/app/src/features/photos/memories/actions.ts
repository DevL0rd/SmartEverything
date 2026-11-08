import { router } from 'expo-router';
import type { DriveItem, Memory } from '@smarteverything/domain';
import { createDriveAlbum } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import type { PickedFile } from '../../../platform/pick-files';
import { useMutationState } from '../../../store/mutation';
import { attachFiles, useLastChat } from '../../assistant';
import { driveLinks } from '../../nas/data';
import { albumRequestOf } from './model';

export const NO_CHAT_HINT = 'Open a chat first, then come back to add this photo to it.';

export interface MemoryAction {
  readonly run: () => void;
  readonly busy: boolean;
  readonly hint: string | null;
}

export function useSaveAsAlbum(memory: Memory): MemoryAction | null {
  const mutation = useMutationState();
  const request = albumRequestOf(memory);
  if (request === null) return null;
  return {
    busy: mutation.busy,
    hint: null,
    run: (): void => {
      mutation.run(() => createDriveAlbum(request), {
        label: 'photos.memory.save_album',
        failure: 'The album was not saved',
        onDone: (album) => {
          notify({
            message: `${album.title} saved as an album`,
            tone: 'positive',
            action: {
              label: 'Open album',
              onPress: () => {
                router.push(href.photosAlbum(album.id));
              },
            },
          });
        },
      });
    },
  };
}

async function originalOf(item: DriveItem): Promise<ArrayBuffer> {
  const url = await driveLinks.resolve(item.id, item.rev, 'file');
  if (url === null) throw new Error(`The hub gave no download link for ${item.name}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Downloading ${item.name} failed with status ${String(response.status)}`);
  }
  return response.arrayBuffer();
}

export function pickedOf(item: DriveItem, preview: string | null): PickedFile | null {
  if (item.kind !== 'image' && item.kind !== 'video') return null;
  return {
    name: item.name,
    mime: item.mime,
    bytes: item.bytes,
    preview,
    data: () => originalOf(item),
  };
}

export function useToChat(item: DriveItem | null, preview: string | null): MemoryAction {
  const last = useLastChat();
  const chatId = last.kind === 'open' ? last.chatId : null;
  const file = item === null ? null : pickedOf(item, preview);
  return {
    busy: false,
    hint: chatId === null ? NO_CHAT_HINT : null,
    run: (): void => {
      if (chatId === null || file === null) return;
      attachFiles([file], chatId);
      notify({
        message: `${file.name} added to the message field`,
        tone: 'positive',
        action: {
          label: 'Open chat',
          onPress: () => {
            router.push(href.assistantChat(chatId));
          },
        },
      });
    },
  };
}
