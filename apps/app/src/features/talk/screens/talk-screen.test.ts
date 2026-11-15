import { router } from 'expo-router';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TALK_CHANNEL_ROW, type TalkChannelRow } from '@smarteverything/domain';
import type { ChannelCardProps } from '../components/channel-card';
import { TalkScreen } from './talk-screen';
import { talkSectionsOf } from './talk-sections';

const { cards, joined, guest } = vi.hoisted(() => ({
  cards: new Map<string, () => void>(),
  joined: { id: '00000000-0000-4000-8000-000000000001', name: 'Joined channel', icon: 'radio' },
  guest: { id: '00000000-0000-4000-8000-000000000002', name: 'Guest channel', icon: 'home' },
}));

vi.mock('../../../app-shell/main-pages', () => ({ mainPageSettings: vi.fn() }));
vi.mock('../../../components/page-shell/page-shell', () => ({
  PageShell: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock(import('./talk-sections'), async (importOriginal) => ({
  ...(await importOriginal()),
  useTalkSections: (): undefined => undefined,
}));
vi.mock('../components/channel-card', () => ({
  ChannelCard: ({ channel, onOpen }: ChannelCardProps): null => {
    cards.set(channel.id, onOpen);
    return null;
  },
}));
vi.mock('../components/channel-panel', () => ({ ChannelPanel: (): null => null }));
vi.mock('../components/device-status', () => ({ DeviceStatus: (): null => null }));
vi.mock('../data/talk-channel', () => ({ useTalkChannelId: (): string => joined.id }));
vi.mock('../data/talk-data', () => ({
  useTalkChannel: (): typeof joined => joined,
  useTalkChannels: (): readonly (typeof joined | typeof guest)[] => [joined, guest],
  useMyChannels: (): readonly (typeof joined)[] => [joined],
}));

function rowOf(channel: typeof joined | typeof guest, position: number): TalkChannelRow {
  return TALK_CHANNEL_ROW.parse({
    ...channel,
    priority: 'normal',
    keep_hours: 24,
    position,
    created_at: '2026-11-15T00:00:00.000Z',
    updated_at: '2026-11-15T00:00:00.000Z',
  });
}

const JOINED = rowOf(joined, 0);
const GUEST = rowOf(guest, 1);

function openRow(channelId: string): void {
  renderToStaticMarkup(createElement(TalkScreen));
  const open = cards.get(channelId);
  if (open === undefined) {
    throw new Error(`Missing channel row ${channelId}`);
  }
  open();
}

describe('Walkie-talkie channel list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cards.clear();
  });

  it.each([joined.id, guest.id])('opens the %s channel route from the phone list', (channelId) => {
    openRow(channelId);

    expect(router.push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/talk/[channelId]',
      params: { channelId },
    });
  });
});

describe('Walkie-talkie channel sections', () => {
  it('groups your channels before the other channels and links each to its route', () => {
    const sections = talkSectionsOf([JOINED], [JOINED, GUEST], guest.id);

    expect(sections?.active).toBe(guest.id);
    expect(sections?.master).toBe(true);
    expect(sections?.groups.map((group) => group.title)).toEqual([
      'Your channels',
      'Other channels',
    ]);
    expect(sections?.groups.map((group) => group.entries.map((entry) => entry.id))).toEqual([
      [joined.id],
      [guest.id],
    ]);
    expect(sections?.hrefOf(guest.id)).toEqual({
      pathname: '/talk/[channelId]',
      params: { channelId: guest.id },
    });
  });

  it('drops an empty group and gives no sections without channels', () => {
    expect(talkSectionsOf([], [GUEST], null)?.groups.map((group) => group.title)).toEqual([
      'Other channels',
    ]);
    expect(talkSectionsOf([], [GUEST], null)?.active).toBe('');
    expect(talkSectionsOf([], [], null)).toBeUndefined();
  });
});
