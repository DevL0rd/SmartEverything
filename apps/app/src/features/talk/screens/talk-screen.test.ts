import { router } from 'expo-router';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SizeClass } from '../../../design/size-class';
import type { ChannelCardProps } from '../components/channel-card';
import { chooseTalkChannel } from '../data/talk-channel';
import { TalkScreen } from './talk-screen';

const { cards, viewport, joined, guest } = vi.hoisted(() => ({
  cards: new Map<string, () => void>(),
  viewport: { split: false },
  joined: { id: 'joined', name: 'Joined channel' },
  guest: { id: 'guest', name: 'Guest channel' },
}));

vi.mock('../../../app-shell/main-pages', () => ({ mainPageSettings: vi.fn() }));
vi.mock('../../../components/master-detail', () => ({
  MasterDetail: ({ master }: { readonly master: ReactNode }): ReactNode => master,
}));
vi.mock('../../../components/screen', () => ({
  Screen: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/page-header', () => ({ PageHeader: (): null => null }));
vi.mock(import('../../../design/size-class'), async (importOriginal) => {
  const sizeClass = await importOriginal();
  return {
    ...sizeClass,
    useSizeClass: (): SizeClass => ({ ...sizeClass.useSizeClass(), split: viewport.split }),
  };
});
vi.mock('../components/channel-card', () => ({
  ChannelCard: ({ channel, onOpen }: ChannelCardProps): null => {
    cards.set(channel.id, onOpen);
    return null;
  },
}));
vi.mock('../components/channel-panel', () => ({ ChannelPanel: (): null => null }));
vi.mock('../components/device-status', () => ({ DeviceStatus: (): null => null }));
vi.mock('../data/talk-channel', () => ({
  chooseTalkChannel: vi.fn(),
  useTalkChannelId: (): string => joined.id,
}));
vi.mock('../data/talk-data', () => ({
  useTalkChannel: (): typeof joined => joined,
  useTalkChannels: (): readonly (typeof joined | typeof guest)[] => [joined, guest],
  useMyChannels: (): readonly (typeof joined)[] => [joined],
}));

function openRow(channelId: string): void {
  renderToStaticMarkup(createElement(TalkScreen));
  const open = cards.get(channelId);
  if (open === undefined) {
    throw new Error(`Missing channel row ${channelId}`);
  }
  open();
}

describe('Walkie-talkie channel navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cards.clear();
  });

  it.each([false, true])('opens a guest channel route with split mode %s', (split) => {
    viewport.split = split;
    openRow(guest.id);

    expect(router.push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/talk/[channelId]',
      params: { channelId: guest.id },
    });
    expect(chooseTalkChannel).not.toHaveBeenCalled();
  });

  it('opens a joined channel route in the phone layout', () => {
    viewport.split = false;
    openRow(joined.id);

    expect(router.push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/talk/[channelId]',
      params: { channelId: joined.id },
    });
    expect(chooseTalkChannel).not.toHaveBeenCalled();
  });

  it('selects a joined channel in the split view', () => {
    viewport.split = true;
    openRow(joined.id);

    expect(chooseTalkChannel).toHaveBeenCalledExactlyOnceWith(joined.id);
    expect(router.push).not.toHaveBeenCalled();
  });
});
