import { describe, expect, it, vi } from 'vitest';
import { photoFlags } from '@smarteverything/domain';
import { fixtureTile } from '../../../components/media-grid/fixtures';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { tileMenu, type TileMenuActions } from './tile-menu';

function actions(chatHint: string | null = null): TileMenuActions & { readonly seen: string[] } {
  const seen: string[] = [];
  const log =
    (name: string) =>
    (tile: MediaTile): void => {
      seen.push(`${name}:${tile.id}`);
    };
  return {
    seen,
    chatHint,
    open: log('open'),
    favourite: (tile, on): void => {
      seen.push(`favourite:${tile.id}:${String(on)}`);
    },
    select: log('select'),
    album: log('album'),
    chat: log('chat'),
    share: log('share'),
    download: log('download'),
    drive: log('drive'),
    ask: log('ask'),
    trash: log('trash'),
  };
}

const TILE = { ...fixtureTile(0, 5), flags: 0 };

describe('timeline tile menu', () => {
  it('puts Favourite, To chat, Share and Trash in the phone quick row with Trash last', () => {
    const menu = tileMenu(TILE, actions(), true);
    expect(menu.quick.map((item) => item.label)).toEqual([
      'Favourite',
      'To chat',
      'Share',
      'Trash',
    ]);
    expect(menu.quick.at(-1)?.destructive).toBe(true);
    expect(menu.items.map((item) => item.label)).toEqual(['Info', 'Add to album', 'Select']);
  });

  it('lists every row on desktop with Move to trash last and tinted', () => {
    const menu = tileMenu(TILE, actions(), false);
    expect(menu.quick).toEqual([]);
    expect(menu.items.map((item) => item.label)).toEqual([
      'Info',
      'Favourite',
      'Add to album',
      'Send to chat',
      'Share link',
      'Download original',
      'Show in Drive',
      'Ask about this photo',
      'Move to trash',
    ]);
    expect(menu.items.at(-1)?.destructive).toBe(true);
    expect(menu.items.map((item) => item.shortcut).filter(Boolean)).toEqual(['I', 'F', 'Del']);
  });

  it('turns a favourite off and runs each action for the pressed tile', () => {
    const run = actions();
    const loved = { ...TILE, flags: photoFlags(['favourite']) };
    const menu = tileMenu(loved, run, false);
    for (const item of menu.items) item.onPress();
    expect(menu.items[1]?.label).toBe('Unfavourite');
    expect(run.seen).toEqual([
      `open:${loved.id}`,
      `favourite:${loved.id}:false`,
      `album:${loved.id}`,
      `chat:${loved.id}`,
      `share:${loved.id}`,
      `download:${loved.id}`,
      `drive:${loved.id}`,
      `ask:${loved.id}`,
      `trash:${loved.id}`,
    ]);
  });

  it('turns Send to chat off with the reason when no chat is open', () => {
    const hint = 'Open a chat first';
    const desk = tileMenu(TILE, actions(hint), false).items.find((item) => item.id === 'chat');
    const phone = tileMenu(TILE, actions(hint), true).quick.find((item) => item.id === 'chat');
    expect(desk).toMatchObject({ disabled: true, description: hint });
    expect(phone).toMatchObject({ label: 'To chat', disabled: true });
  });

  it('names a video in the Ask row and turns it off with the reason when no chat is open', () => {
    const hint = 'Open a chat first';
    const clip = { ...TILE, flags: photoFlags(['video']) };
    const ask = tileMenu(clip, actions(hint), false).items.find((item) => item.id === 'ask');
    expect(ask).toMatchObject({ label: 'Ask about this video', disabled: true, description: hint });
  });

  it('does nothing until a row is pressed', () => {
    const open = vi.fn();
    tileMenu(TILE, { ...actions(), open }, true);
    expect(open).not.toHaveBeenCalled();
  });
});

it('offers only device actions for local media and never sends it to hub actions', () => {
  const run = actions();
  const tile = { ...TILE, id: 'local:media:7', local: true };
  const menu = tileMenu(tile, run, false);
  expect(menu.items.map((item) => item.label)).toEqual(['Open', 'Select', 'Back up']);
  menu.items[0]?.onPress();
  menu.items[1]?.onPress();
  expect(run.seen).toEqual(['open:local:media:7', 'select:local:media:7']);
  expect(tileMenu(tile, run, true).quick).toEqual([]);
});
