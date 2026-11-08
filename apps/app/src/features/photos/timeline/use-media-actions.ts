import { background } from '@smarteverything/logging';
import type { MenuItem } from '../../../components/menu';
import { useLastChat } from '../../assistant';
import { useDriveAlbums } from '../../nas/data/tables';
import { NO_CHAT_HINT } from '../memories/actions';
import { albumMenuItems } from '../viewer/menus';
import { addToAlbum, moveToTrash, setFavourite } from './actions';
import { askAbout, downloadItems, sendToChat, shareLink, showInDrive } from './item-actions';

type Ids = readonly string[];

export interface MediaActions {
  readonly chatHint: string | null;
  readonly albums: (ids: Ids) => readonly MenuItem[];
  readonly favourite: (ids: Ids, on: boolean) => void;
  readonly toChat: (ids: Ids) => void;
  readonly share: (itemId: string) => void;
  readonly download: (ids: Ids) => void;
  readonly showInDrive: (itemId: string) => void;
  readonly ask: (itemId: string) => void;
  readonly trash: (ids: Ids, onMoved: () => void) => void;
}

export function useMediaActions(): MediaActions {
  const albums = useDriveAlbums('photos');
  const last = useLastChat();
  const chatId = last.kind === 'open' ? last.chatId : null;
  return {
    chatHint: chatId === null ? NO_CHAT_HINT : null,
    albums: (ids) =>
      albumMenuItems(albums, (id, title) => {
        background(addToAlbum(ids, { id, title }), 'photos.album_add_failed');
      }),
    favourite: (ids, on): void => {
      background(setFavourite(ids, on), 'photos.favourite_failed');
    },
    toChat: (ids): void => {
      if (chatId !== null) background(sendToChat(ids, chatId), 'photos.to_chat_failed');
    },
    share: (itemId): void => {
      background(shareLink(itemId), 'photos.share_failed');
    },
    download: (ids): void => {
      background(downloadItems(ids), 'photos.download_failed');
    },
    showInDrive: (itemId): void => {
      background(showInDrive(itemId), 'photos.show_in_drive_failed');
    },
    ask: (itemId): void => {
      if (chatId !== null) background(askAbout(itemId, chatId), 'photos.ask_failed');
    },
    trash: (ids, onMoved): void => {
      background(
        moveToTrash(ids).then((moved) => {
          if (moved) onMoved();
        }),
        'photos.trash_failed',
      );
    },
  };
}
