import { beforeEach, describe, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => ({ values: new Map<string, unknown>() }));

vi.mock('../../../store/browser-metadata', () => ({
  browserMetadata: (key: string): unknown => saved.values.get(key),
  setBrowserMetadata: (key: string, value: unknown): void => {
    saved.values.set(key, value);
  },
  forgetBrowserMetadataWhere: (forgotten: (key: string) => boolean): void => {
    for (const key of [...saved.values.keys()]) if (forgotten(key)) saved.values.delete(key);
  },
}));

const { browserTabsKey, forgetChatBrowserTabs } = await import('./browser-tab-persistence');

describe('forgetting a deleted chat', () => {
  beforeEach(() => {
    saved.values.clear();
  });

  it('drops the tabs of that chat on every enrollment and keeps the other chats', () => {
    const doomed = browserTabsKey('https://hub.a', 'client', 'profile', 'chat-1');
    const sameChatElsewhere = browserTabsKey('https://hub.b', 'client', 'profile', 'chat-1');
    const other = browserTabsKey('https://hub.a', 'client', 'profile', 'chat-2');
    for (const key of [doomed, sameChatElsewhere, other]) saved.values.set(key, { tabs: [] });
    saved.values.set('not-a-key', { tabs: [] });
    forgetChatBrowserTabs('chat-1');
    expect([...saved.values.keys()].sort()).toEqual([other, 'not-a-key'].sort());
  });
});
