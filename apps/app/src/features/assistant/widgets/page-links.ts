import type { Href } from 'expo-router';
import type { ChatLink, ChatLinkPage } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import type { StoreState } from '../../../store/state';
import type { LinkView } from './link-sources';

type Tables = StoreState['tables'];

export type PageLink = Extract<ChatLink, { kind: 'page_link' }>;

interface PageKind {
  readonly icon: IconName;
  readonly trail: string;
  readonly title: (tables: Tables, id: string | null) => string | null;
  readonly to: (id: string | null) => Href;
}

function titled<T>(row: T | undefined, name: (row: T) => string): string | null {
  return row === undefined ? null : name(row);
}

const PAGES: Readonly<Record<ChatLinkPage, PageKind>> = {
  chat: {
    icon: 'messageCircle',
    trail: 'Chat',
    title: (tables, id) =>
      id === null ? 'Chats' : titled(tables.ai_chats.byId[id], (row) => row.title),
    to: (id) => href.assistantChat(id ?? undefined),
  },
  costs: {
    icon: 'gauge',
    trail: 'Assistant',
    title: () => 'Costs',
    to: (id) => href.assistantCosts(id === null ? undefined : { chat: id }),
  },
  plugin: {
    icon: 'puzzle',
    trail: 'Plugin',
    title: (tables, id) =>
      id === null ? null : titled(tables.plugins.byId[id], (row) => row.manifest.name),
    to: (id) => (id === null ? href.more() : href.pluginSettings(id)),
  },
  person: {
    icon: 'user',
    trail: 'Person',
    title: (tables, id) =>
      id === null ? null : titled(tables.profiles.byId[id], (row) => row.name),
    to: (id) => (id === null ? href.more() : href.settings.profile(id)),
  },
};

export function pageLinkView(link: PageLink, tables: Tables): LinkView | null {
  const page = PAGES[link.page];
  const title = page.title(tables, link.id);
  return title === null
    ? null
    : {
        key: `page:${link.page}:${link.id ?? ''}`,
        specific: true,
        icon: page.icon,
        title,
        trail: page.trail,
        value: link.value,
        href: page.to(link.id),
        toggle: null,
      };
}
