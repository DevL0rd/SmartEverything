import { describe, expect, it, vi } from 'vitest';

const { push, navigate } = vi.hoisted(() => ({ push: vi.fn(), navigate: vi.fn() }));

vi.mock('expo-router', () => ({ router: { push, navigate } }));
vi.mock('../../../components/menu', () => ({ OverflowButton: (): null => null }));

const { chatMenuItems } = await import('./chat-header-menu');
const { pageMenuOf } = await import('../../../components/page-menu');
const { mainPageSettings } = await import('../../../app-shell/main-pages');

describe('the chat shell menu', () => {
  it('opens the current chat’s Files page on the stack', () => {
    chatMenuItems('chat-a')
      .find((item) => item.icon === 'folder')
      ?.onPress();
    expect(push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/assistant/chat/[chatId]/files',
      params: { chatId: 'chat-a' },
    });
  });

  it('ends the one shell menu with Assistant settings', () => {
    const menu = pageMenuOf(chatMenuItems('chat-a'), mainPageSettings('assistant'), null);
    const items = menu?.items ?? [];
    expect(items.map((item) => item.icon)).toEqual(['folder', 'settings']);
    items.at(-1)?.onPress();
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      pathname: '/settings/[...page]',
      params: { page: ['assistant'] },
    });
  });
});
