import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));

const { isInstantRoute, openInstantly, preloadInstantly } = await import('./instant-open');

const chat = { name: 'assistant/chat/[chatId]', params: { chatId: 'c1' } };
const route = (key: string): { key: string; name: string; params: object } => ({
  key,
  name: chat.name,
  params: { chatId: 'c1' },
});

describe('instant opens', () => {
  it('keeps a preloaded route instant and lets the later open through', () => {
    const preload = vi.fn();
    preloadInstantly(chat, preload);
    expect(preload).toHaveBeenCalledOnce();
    expect(isInstantRoute(route('pre'))).toBe(true);
    openInstantly('/assistant/chat/c1', chat);
    expect(isInstantRoute(route('pre'))).toBe(true);
    openInstantly('/assistant/chat/c1', chat);
    expect(isInstantRoute(route('other'))).toBe(true);
  });

  it('does not make unrelated routes instant', () => {
    expect(isInstantRoute({ key: 'plain', name: 'assistant/usage' })).toBe(false);
  });
});
