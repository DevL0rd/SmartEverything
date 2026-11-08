import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { hasPhotoFlag } from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';
import type { MediaTile } from '../../../components/media-grid/tiles';

type TileAction = (tile: MediaTile) => void;

export interface TileMenuActions {
  readonly chatHint: string | null;
  readonly open: TileAction;
  readonly favourite: (tile: MediaTile, on: boolean) => void;
  readonly select: TileAction;
  readonly album: TileAction;
  readonly chat: TileAction;
  readonly share: TileAction;
  readonly download: TileAction;
  readonly drive: TileAction;
  readonly ask: TileAction;
  readonly trash: TileAction;
}

export interface TileMenu {
  readonly quick: readonly MenuItem[];
  readonly items: readonly MenuItem[];
}

type RowId =
  | 'info'
  | 'favourite'
  | 'album'
  | 'chat'
  | 'share'
  | 'download'
  | 'drive'
  | 'ask'
  | 'select'
  | 'trash';

type Rows = Readonly<Record<RowId, MenuItem>>;

function row(
  id: RowId,
  label: string,
  icon: NonNullable<MenuItem['icon']>,
  onPress: () => void,
): MenuItem {
  return { id, label, icon, onPress };
}

function needsChat(item: MenuItem, hint: string | null): MenuItem {
  return hint === null ? item : { ...item, disabled: true, description: hint };
}

function chatRow(tile: MediaTile, actions: TileMenuActions): MenuItem {
  const item = row('chat', 'Send to chat', 'messageCircle', () => {
    actions.chat(tile);
  });
  return needsChat(item, actions.chatHint);
}

function askRow(tile: MediaTile, actions: TileMenuActions): MenuItem {
  const label = hasPhotoFlag(tile.flags, 'video') ? 'Ask about this video' : 'Ask about this photo';
  const item = row('ask', label, 'sparkles', () => {
    actions.ask(tile);
  });
  return needsChat(item, actions.chatHint);
}

function rowsOf(tile: MediaTile, actions: TileMenuActions): Rows {
  const favourite = hasPhotoFlag(tile.flags, 'favourite');
  const on = (action: TileAction) => (): void => {
    action(tile);
  };
  return {
    info: { ...row('info', 'Info', 'info', on(actions.open)), shortcut: 'I' },
    favourite: {
      ...row('favourite', favourite ? 'Unfavourite' : 'Favourite', 'star', () => {
        actions.favourite(tile, !favourite);
      }),
      shortcut: 'F',
    },
    album: row('album', 'Add to album', 'layers', on(actions.album)),
    chat: chatRow(tile, actions),
    share: row('share', 'Share link', 'share', on(actions.share)),
    download: row('download', 'Download original', 'download', on(actions.download)),
    drive: row('drive', 'Show in Drive', 'folder', on(actions.drive)),
    ask: askRow(tile, actions),
    select: row('select', 'Select', 'circleCheck', on(actions.select)),
    trash: {
      ...row('trash', 'Move to trash', 'trash', on(actions.trash)),
      destructive: true,
      shortcut: 'Del',
    },
  };
}

function localMenu(tile: MediaTile, actions: TileMenuActions): TileMenu {
  return {
    quick: [],
    items: [
      {
        id: 'open',
        label: 'Open',
        icon: 'image',
        onPress: (): void => {
          actions.open(tile);
        },
      },
      {
        id: 'select',
        label: 'Select',
        icon: 'circleCheck',
        onPress: (): void => {
          actions.select(tile);
        },
      },
      {
        id: 'backup',
        label: tile.backedUp === true ? 'Backup settings' : 'Back up',
        icon: 'upload',
        onPress: (): void => {
          router.push(href.photosPage('backup'));
        },
      },
    ],
  };
}

export function tileMenu(tile: MediaTile, actions: TileMenuActions, touch: boolean): TileMenu {
  if (tile.local) return localMenu(tile, actions);
  const rows = rowsOf(tile, actions);
  if (touch) {
    return {
      quick: [
        rows.favourite,
        { ...rows.chat, label: 'To chat' },
        { ...rows.share, label: 'Share' },
        { ...rows.trash, label: 'Trash' },
      ],
      items: [rows.info, rows.album, rows.select],
    };
  }
  return {
    quick: [],
    items: [
      rows.info,
      rows.favourite,
      rows.album,
      rows.chat,
      rows.share,
      rows.download,
      rows.drive,
      rows.ask,
      rows.trash,
    ],
  };
}
