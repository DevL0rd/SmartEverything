import { useQueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import type { MenuItem } from '../../../components/menu';
import { useLastChat } from '../../assistant';
import { useDriveAlbums, useDriveRoots } from '../../drive';
import { dropPhotoItems } from '../data';
import { openNewAlbum } from '../albums/new-album-host';
import { NO_CHAT_HINT } from '../model/ask-actions';
import { albumMenuItems } from '../viewer/menus';
import { addToAlbum, moveToTrash, setFavourite } from './actions';
import { askAbout, sendToChat, shareLinks, showInDrive } from './item-actions';
import { saveToDevice } from './save-to-device';

type Ids = readonly string[];

export interface MediaActions {
  readonly chatHint: string | null;
  readonly albums: (ids: Ids) => readonly MenuItem[];
  readonly favourite: (ids: Ids, on: boolean) => void;
  readonly toChat: (ids: Ids) => void;
  readonly share: (itemIds: readonly string[]) => void;
  readonly download: (ids: Ids) => void;
  readonly showInDrive: (itemId: string) => void;
  readonly ask: (itemId: string) => void;
  readonly trash: (ids: Ids, onMoved: () => void) => void;
}

export function useMediaActions(): MediaActions {
  const albums = useDriveAlbums('photos');
  const roots = useDriveRoots();
  const last = useLastChat();
  const client = useQueryClient();
  const chatId = last.kind === 'open' ? last.chatId : null;
  return {
    chatHint: chatId === null ? NO_CHAT_HINT : null,
    albums: (ids) =>
      albumMenuItems(
        albums,
        (id, title) => {
          background(addToAlbum(ids, { id, title }), 'photos.album_add_failed');
        },
        () => {
          openNewAlbum(ids);
        },
      ),
    favourite: (ids, on): void => {
      background(setFavourite(ids, on), 'photos.favourite_failed');
    },
    toChat: (ids): void => {
      if (chatId !== null) background(sendToChat(ids, chatId), 'photos.to_chat_failed');
    },
    share: (itemIds): void => {
      background(shareLinks(itemIds), 'photos.share_failed');
    },
    download: (ids): void => {
      background(saveToDevice(ids), 'photos.save_to_device_failed');
    },
    showInDrive: (itemId): void => {
      background(showInDrive(itemId, roots), 'photos.show_in_drive_failed');
    },
    ask: (itemId): void => {
      if (chatId !== null) background(askAbout(itemId, chatId), 'photos.ask_failed');
    },
    trash: (ids, onMoved): void => {
      background(
        moveToTrash(ids, (landed) => {
          dropPhotoItems(client, landed);
        }).then((moved) => {
          if (moved) onMoved();
        }),
        'photos.trash_failed',
      );
    },
  };
}
