import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '../../../components/menu';

const { push, navigate, renderedMenu } = vi.hoisted(() => ({
  push: vi.fn(),
  navigate: vi.fn(),
  renderedMenu: vi.fn<(items: readonly MenuItem[]) => void>(),
}));

vi.mock('expo-router', () => ({ router: { push, navigate } }));
vi.mock('../../../components/menu', () => ({
  OverflowButton: ({ items }: { readonly items: readonly MenuItem[] }): null => {
    renderedMenu(items);
    return null;
  },
}));

const { ChatHeaderMenu } = await import('./chat-header-menu');

function menuItems(): readonly MenuItem[] {
  renderedMenu.mockClear();
  renderToStaticMarkup(createElement(ChatHeaderMenu, { chatId: 'chat-a' }));
  return renderedMenu.mock.calls[0]?.[0] ?? [];
}

describe('the chat shell menu', () => {
  it('opens the current chat’s Files page on the stack', () => {
    menuItems()
      .find((item) => item.icon === 'folder')
      ?.onPress();
    expect(push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/assistant/chat/[chatId]/files',
      params: { chatId: 'chat-a' },
    });
  });

  it('offers Assistant settings without duplicating sidebar or composer controls', () => {
    const items = menuItems();
    expect(items.map((item) => item.icon)).toEqual(['folder', 'sparkles']);
    items.find((item) => item.icon === 'sparkles')?.onPress();
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      pathname: '/settings/[...page]',
      params: { page: ['assistant'] },
    });
  });
});
