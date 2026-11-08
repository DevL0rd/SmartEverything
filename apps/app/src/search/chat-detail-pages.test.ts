import { describe, expect, it } from 'vitest';
import { ASSISTANT_ACTIONS } from '../app-shell/assistant-actions';
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
  runtime: 'dsh',
};

function linksOf(): SourceLinks {
  return { links: new Map(), icons: new Map(), parents: new Map(), plugins: new Set() };
}

describe('the pages of a chat', () => {
  const out = linksOf();
  const pages = chatDetailPages(CHAT, out);
  const titles = pages.map((page) => page.title);

  it('keeps Browser and removes the old overview, activity and branch destinations', () => {
    for (const tab of ['overview', 'activity', 'branches', 'tools']) {
      expect(out.links.has(`page:chat:chat-1#${tab}`), tab).toBe(false);
    }
    expect(out.links.get('page:chat:chat-1#browser')).toMatchObject({
      params: { chatId: 'chat-1', section: 'browser' },
    });
  });

  it('nests Tools under Access and Plan first under the model menu', () => {
    const path = 'page:chat:chat-1#control:';
    expect(out.parents.get(`${path}tools`)).toBe(`${path}access`);
    expect(out.links.get(`${path}tools`)).toMatchObject({ params: { operation: 'access-tools' } });
    expect(out.parents.get(`${path}plan`)).toBe(`${path}model`);
    expect(out.links.get(`${path}plan`)).toMatchObject({ params: { operation: 'model' } });
    expect(
      chatDetailPages({ ...CHAT, runtime: 'codex' }, linksOf()).map((page) => page.title),
    ).not.toContain('Plan first');
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
    expect(operation('rename')).toMatchObject({ operation: 'rename' });
  });

  it('opens files on their own page instead of in the details sheet', () => {
    expect(out.links.get('page:chat:chat-1#files')).toEqual({
      pathname: '/assistant/chat/[chatId]/files',
      params: { chatId: 'chat-1' },
    });
  });

  it('lists files without advertising unavailable chat panels for history-only chats', () => {
    const historyLinks = linksOf();
    const history = { ...CHAT, computer: true, runtime: 'codex', historyOnly: true } as const;
    expect(chatDetailPages(history, historyLinks).map((page) => page.title)).toEqual(['Files']);
    expect([...historyLinks.links.keys()]).toEqual(['page:chat:chat-1#files']);
  });

  it('only links operations the chat screen consumes', () => {
    const consumed = ['model', 'device', 'access', 'access-tools', 'rename'];
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
