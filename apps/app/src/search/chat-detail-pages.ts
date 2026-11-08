import type { AppHref } from '../components/app-href';
import type { SearchSources } from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import type { IconName } from '../components/icon';
import { BROWSER_ACTIONS } from '../features/assistant/browser/browser-actions';
import type { SearchChat, SourceLinks } from './sources';

interface ChatPage {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
}

const FILES_PAGE: ChatPage = {
  id: 'files',
  title: 'Files',
  icon: 'folder',
  keywords: ['attachment', 'file', 'uploads', 'project files', 'workspace files'],
};

const BROWSER_PAGE: ChatPage = {
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
  readonly parent?: string;
}

const CONTROL_PAGES: readonly ControlPage[] = [
  {
    id: 'rename',
    title: 'Rename chat',
    icon: 'pencil',
    operation: 'rename',
    keywords: ['title', 'name', 'edit name', 'change title'],
  },
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
  {
    id: 'tools',
    title: 'Tools for this chat',
    icon: 'wrench',
    operation: 'access-tools',
    parent: 'access',
    keywords: ['allowed tools', 'allow all', 'permissions', 'mcp', 'home tools'],
  },
  {
    id: 'plan',
    title: 'Plan first',
    icon: 'plan',
    operation: 'model',
    parent: 'model',
    keywords: ['plan mode', 'turn on', 'turn off', 'approve plan'],
  },
];

interface Registered {
  readonly to: AppHref;
  readonly icon: IconName;
  readonly parent: string;
}

function register(out: SourceLinks, path: string, page: Registered): void {
  out.links.set(`page:${path}`, page.to);
  out.icons.set(`page:${path}`, page.icon);
  out.parents.set(`page:${path}`, page.parent);
}

function agentPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return (chat.agents ?? []).flatMap((row) => {
    if (row.child_chat_id === null) return [];
    const path = `chat:${chat.id}#agent:${row.id}`;
    register(out, path, {
      to: href.assistantChat(row.child_chat_id),
      icon: 'users',
      parent: `page:chat:${chat.id}`,
    });
    return [
      {
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
      },
    ];
  });
}

function browserPage(chat: SearchChat, out: SourceLinks): SearchSources['pages'][number] {
  const path = `chat:${chat.id}#${BROWSER_PAGE.id}`;
  register(out, path, {
    to: href.assistantChat(chat.id, { section: 'browser' }),
    icon: BROWSER_PAGE.icon,
    parent: `page:chat:${chat.id}`,
  });
  return {
    path,
    title: BROWSER_PAGE.title,
    description: chat.title,
    keywords: [...BROWSER_PAGE.keywords],
  };
}

function filesPage(chat: SearchChat, out: SourceLinks): SearchSources['pages'][number] {
  const path = `chat:${chat.id}#${FILES_PAGE.id}`;
  register(out, path, {
    to: href.assistantChatFiles(chat.id),
    icon: FILES_PAGE.icon,
    parent: `page:chat:${chat.id}`,
  });
  return {
    path,
    title: FILES_PAGE.title,
    description: chat.title,
    keywords: [...FILES_PAGE.keywords],
  };
}

function controlPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return CONTROL_PAGES.flatMap((control) => {
    if (control.id === 'plan' && chat.runtime !== 'dsh') return [];
    const path = `chat:${chat.id}#control:${control.id}`;
    const to = href.assistantChat(chat.id, {
      ...(control.operation === undefined ? {} : { operation: control.operation }),
    });
    const parent = control.parent === undefined ? '' : `#control:${control.parent}`;
    register(out, path, { to, icon: control.icon, parent: `page:chat:${chat.id}${parent}` });
    return [
      {
        path,
        title: control.title,
        description: chat.title,
        keywords: ['chat', ...control.keywords],
      },
    ];
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
  if (chat.historyOnly === true) return [filesPage(chat, out)];
  return [
    ...agentPages(chat, out),
    browserPage(chat, out),
    filesPage(chat, out),
    ...controlPages(chat, out),
    ...browserActionPages(chat, out),
  ];
}
