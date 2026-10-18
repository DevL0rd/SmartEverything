import type { Href } from 'expo-router';
import type { SearchSources } from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import type { IconName } from '../components/icon';
import { BROWSER_ACTIONS } from '../features/assistant/browser/browser-actions';
import { DETAIL_TABS, type DetailTab } from '../features/assistant/details/details-target';
import type { SearchChat, SourceLinks } from './sources';

interface ChatPage {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
}

interface TabPage extends ChatPage {
  readonly id: DetailTab | 'browser';
}

const TAB_PAGES: Readonly<Record<DetailTab, TabPage>> = {
  overview: {
    id: 'overview',
    title: 'Overview',
    icon: 'info',
    keywords: [
      'details',
      'model',
      'runs on',
      'machine',
      'access',
      'context',
      'compact',
      'cost',
      'started from',
      'parent chat',
      'rename',
      'pin',
    ],
  },
  activity: {
    id: 'activity',
    title: 'Activity',
    icon: 'activity',
    keywords: ['agents', 'helpers', 'runs', 'work', 'background', 'images', 'progress', 'steps'],
  },
  files: {
    id: 'files',
    title: 'Files',
    icon: 'folder',
    keywords: ['attachment', 'file', 'uploads', 'project files', 'workspace files'],
  },
  branches: {
    id: 'branches',
    title: 'Branches',
    icon: 'layers',
    keywords: ['branch', 'history', 'fork'],
  },
  tools: {
    id: 'tools',
    title: 'Tools',
    icon: 'wrench',
    keywords: ['allowed tools', 'allow all', 'permissions', 'mcp', 'home tools'],
  },
};

const BROWSER_PAGE: TabPage = {
  id: 'browser',
  title: 'Browser',
  icon: 'globe',
  keywords: [
    'browser',
    'preview',
    'published service',
    'address',
    'back',
    'forward',
    'reload',
    'stop loading',
    'choose shared service',
    'public website',
    'localhost',
    'development app',
  ],
};

interface ControlPage extends ChatPage {
  readonly operation?: string;
}

const CONTROL_PAGES: readonly ControlPage[] = [
  {
    id: 'model',
    title: 'Change model',
    icon: 'brain',
    operation: 'model',
    keywords: [
      'model',
      'models',
      'LLM',
      'switch model',
      'GPT',
      'Claude',
      'Gemini',
      'supplier',
      'account',
      'subscription',
      'search',
      'favorites',
      'maker',
      'input modality',
      'output modality',
      'minimum context',
      'input token price',
      'output token price',
      'sort',
      'newest',
      'intelligence',
      'latency',
      'largest context',
      'source details',
    ],
  },
  {
    id: 'thinking',
    title: 'Thinking level',
    icon: 'brain',
    operation: 'model',
    keywords: ['thinking', 'reasoning', 'effort', 'think harder', 'low', 'medium', 'high'],
  },
  {
    id: 'access',
    title: 'Access',
    icon: 'shield',
    operation: 'access',
    keywords: [
      'permissions',
      'recorded permissions',
      'sandbox',
      'approvals',
      'approval',
      'full access',
      'read only',
      'workspace write',
      'ask first',
    ],
  },
  {
    id: 'queue',
    title: 'Queue',
    icon: 'layers',
    keywords: [
      'queued messages',
      'waiting',
      'steer',
      'pending',
      'outbox',
      'not sent',
      'send later',
    ],
  },
];

interface Registered {
  readonly to: Href;
  readonly icon: IconName;
  readonly parent: string;
}

function register(out: SourceLinks, path: string, page: Registered): void {
  out.links.set(`page:${path}`, page.to);
  out.icons.set(`page:${path}`, page.icon);
  out.parents.set(`page:${path}`, page.parent);
}

function agentPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return (chat.agents ?? []).map((row) => {
    const path = `chat:${chat.id}#agent:${row.id}`;
    register(out, path, {
      to: href.assistantChat(row.child_chat_id ?? chat.id, { sheet: 'chat', agent: row.id }),
      icon: 'users',
      parent: `page:chat:${chat.id}`,
    });
    return {
      path,
      title: row.title,
      description: chat.title,
      keywords: [
        'agent',
        'helper',
        row.source,
        row.state,
        row.task ?? '',
        row.progress ?? '',
        row.result ?? '',
      ],
    };
  });
}

function tabPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return [...DETAIL_TABS.map((tab) => TAB_PAGES[tab]), BROWSER_PAGE].map((tab) => {
    const path = `chat:${chat.id}#${tab.id}`;
    const to =
      tab.id === 'browser'
        ? href.assistantChat(chat.id, { section: 'browser' })
        : href.assistantChat(chat.id, { sheet: 'chat', section: tab.id });
    register(out, path, { to, icon: tab.icon, parent: `page:chat:${chat.id}` });
    return { path, title: tab.title, description: chat.title, keywords: [...tab.keywords] };
  });
}

function controlPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return CONTROL_PAGES.map((control) => {
    const path = `chat:${chat.id}#control:${control.id}`;
    const to = href.assistantChat(chat.id, {
      ...(control.operation === undefined ? {} : { operation: control.operation }),
    });
    register(out, path, { to, icon: control.icon, parent: `page:chat:${chat.id}` });
    return {
      path,
      title: control.title,
      description: chat.title,
      keywords: ['chat', ...control.keywords],
    };
  });
}

function browserActionPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return BROWSER_ACTIONS.map((action) => {
    const path = `chat:${chat.id}#browser:${action.id}`;
    register(out, path, {
      to: href.assistantChat(chat.id, { section: 'browser', browserAction: action.id }),
      icon: action.icon,
      parent: `page:chat:${chat.id}#browser`,
    });
    return {
      path,
      title: action.title,
      description: chat.title,
      keywords: ['browser', 'preview', ...action.keywords],
    };
  });
}

export function chatDetailPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return [
    ...agentPages(chat, out),
    ...tabPages(chat, out),
    ...controlPages(chat, out),
    ...browserActionPages(chat, out),
  ];
}
