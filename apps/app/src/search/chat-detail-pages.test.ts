import { describe, expect, it } from 'vitest';
import { ASSISTANT_ACTIONS } from '../app-shell/assistant-actions';
import type { PanelOperation } from '../features/assistant/details/details-scope';
import { DETAIL_TABS } from '../features/assistant/details/details-target';
import { chatDetailPages } from './chat-detail-pages';
import { settingsPage } from '../settings/tree';
import type { SearchChat, SourceLinks } from './sources';
import { synonymsOf } from './synonyms';

const CHAT: SearchChat = {
  id: 'chat-1',
  title: 'Garden plan',
  source: 'You',
  pinned: false,
  computer: false,
};

function linksOf(): SourceLinks {
  return { links: new Map(), icons: new Map(), parents: new Map(), plugins: new Set() };
}

describe('the pages of a chat', () => {
  const out = linksOf();
  const pages = chatDetailPages(CHAT, out);
  const titles = pages.map((page) => page.title);

  it('has a child node for every details tab and the browser', () => {
    for (const tab of DETAIL_TABS) {
      expect(out.links.get(`page:chat:chat-1#${tab}`), tab).toMatchObject({
        pathname: '/assistant/chat/[chatId]',
        params: { chatId: 'chat-1', sheet: 'chat', section: tab },
      });
    }
    expect(out.links.get('page:chat:chat-1#browser')).toMatchObject({
      params: { chatId: 'chat-1', section: 'browser' },
    });
  });

  it('adds the model, thinking, access and queue entries', () => {
    for (const title of ['Change model', 'Thinking level', 'Access', 'Queue']) {
      expect(titles).toContain(title);
    }
    const operation = (id: string): unknown =>
      Object.entries(out.links.get(`page:chat:chat-1#control:${id}`) ?? {}).find(
        ([key]) => key === 'params',
      )?.[1];
    expect(operation('model')).toMatchObject({ operation: 'model' });
    expect(operation('thinking')).toMatchObject({ operation: 'model' });
    expect(operation('access')).toMatchObject({ operation: 'access' });
  });

  it('only links operations the chat screen consumes', () => {
    const consumed: readonly (PanelOperation | 'rename')[] = [
      'model',
      'device',
      'access',
      'rename',
    ];
    const operations = [...out.links.entries()]
      .filter(([key]) => key.includes('#control:'))
      .map(([, link]) => (typeof link === 'string' ? undefined : link.params?.['operation']));
    for (const operation of operations) {
      if (operation !== undefined) {
        expect(consumed).toContain(operation);
      }
    }
    expect(operations.filter((operation) => operation !== undefined)).not.toHaveLength(0);
  });

  it('gives every page a link, an icon and a parent under its chat', () => {
    for (const page of pages) {
      const key = `page:${page.path}`;
      expect(out.links.has(key), page.path).toBe(true);
      expect(out.icons.has(key), page.path).toBe(true);
      expect(out.parents.get(key), page.path).toMatch(/^page:chat:chat-1/);
    }
  });
});

describe('the assistant palette actions', () => {
  const action = (key: string): (typeof ASSISTANT_ACTIONS)[number] | undefined =>
    ASSISTANT_ACTIONS.find((candidate) => candidate.key === key);

  it('open the models settings page and the access panel of a new chat', () => {
    expect(settingsPage('assistant/models')).toBeDefined();
    expect(action('model-library')?.href).toEqual({
      pathname: '/settings/[...page]',
      params: { page: ['assistant', 'models'] },
    });
    expect(action('change-access')?.href).toEqual({
      pathname: '/assistant/chat/[chatId]',
      params: { chatId: 'new', operation: 'access' },
    });
  });

  it('keep the earlier actions', () => {
    for (const key of ['new-chat', 'call', 'unread-chats', 'archived-chats']) {
      expect(action(key), key).toBeDefined();
    }
  });
});

describe('computer page synonyms', () => {
  it('finds Apps and processes by kill and task manager', () => {
    expect(synonymsOf('Apps and processes')).toEqual(
      expect.arrayContaining(['kill', 'task manager']),
    );
  });
});
