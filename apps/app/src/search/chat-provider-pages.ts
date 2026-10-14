import { browserSearchPages } from './browser-pages';
import { CODEX_OPERATIONS } from '../features/assistant/provider/codex-operations';
import { schemaOf } from '../components/schema-values';
import type { SearchSources } from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import { PROVIDER_OPERATIONS } from '../features/assistant/provider/provider-operations';
import { WORK_TABS } from '../features/assistant/provider/work-tabs';
import type { SearchChat, SourceLinks } from './sources';

export function chatProviderPages(
  chat: SearchChat,
  out: SourceLinks,
  owner: boolean,
): SearchSources['pages'] {
  const agents = chatDetailPages(chat, out);
  if (chat.runtime === 'dsh') return [...agents, ...harnessPages(chat, out)];
  if (!chat.computer || !owner) return agents;
  const pages = [
    ...discoveredPages(chat),
    ...WORK_TABS.map((tab) => ({
      id: tab.value,
      title: tab.label,
      work: tab.value,
      operation: undefined,
      description: `${chat.runtime ?? 'claude'} on your computer`,
    })),
    ...(chat.runtime === 'codex' ? CODEX_OPERATIONS : PROVIDER_OPERATIONS)
      .filter((operation) => chat.metadata?.operations.includes(operation.id) === true)
      .map((operation) => ({
        id: operation.id,
        title: operation.title,
        work: operation.kind,
        operation: operation.id,
        description: operation.description,
      })),
  ];
  return [
    ...agents,
    ...pages.map((page) => {
      const path = `chat:${chat.id}#${page.id}`;
      out.links.set(
        `page:${path}`,
        href.assistantChat(chat.id, {
          work: page.work,
          ...(page.operation === undefined ? {} : { operation: page.operation }),
        }),
      );
      out.icons.set(`page:${path}`, 'wrench');
      out.parents.set(`page:${path}`, `page:chat:${chat.id}`);
      return {
        path,
        title: page.title,
        description: chat.title,
        keywords: [chat.runtime ?? 'claude', 'computer', 'subscription', page.description],
      };
    }),
  ];
}

function discoveredPages(chat: SearchChat): {
  id: string;
  title: string;
  work: string;
  operation: string | undefined;
  description: string;
}[] {
  const metadata = chat.metadata;
  if (metadata === undefined || metadata === null) return [];
  const settings = Object.keys(schemaOf(metadata.flag_settings_schema['properties']));
  return [
    ...settings.map((key) => ({
      id: `flag:${key}`,
      title: key,
      work: 'settings',
      operation: `flag:${key}`,
      description: 'Native SDK setting',
    })),
    ...metadata.commands.map((command) => ({
      id: `command:${command.name}`,
      title: `/${command.name}`,
      work: 'overview',
      operation: undefined,
      description: command.description,
    })),
    ...metadata.agents.map((agent) => ({
      id: `agent:${agent.name}`,
      title: agent.name,
      work: 'overview',
      operation: undefined,
      description: agent.description,
    })),
  ];
}

function agentPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  const rows = chat.agents ?? [];
  return rows.map((row) => {
    const path = `chat:${chat.id}#agent:${row.id}`;
    out.links.set(
      `page:${path}`,
      href.assistantChat(row.child_chat_id ?? chat.id, { sheet: 'chat', agent: row.id }),
    );
    out.icons.set(`page:${path}`, 'users');
    out.parents.set(`page:${path}`, `page:chat:${chat.id}`);
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

const INSPECTOR_PAGES = [
  {
    section: 'info',
    title: 'Overview',
    keywords: [
      'details',
      'model',
      'thinking',
      'supplier',
      'execution',
      'workspace',
      'switch',
      'permissions',
      'questions',
    ],
  },
  { section: 'branches', title: 'Branches', keywords: ['branch', 'history'] },
  { section: 'files', title: 'Files', keywords: ['attachment', 'file'] },
  {
    section: 'browser',
    title: 'Browser',
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
  },
] as const;
function inspectorPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return INSPECTOR_PAGES.map((row) => {
    const path = `chat:${chat.id}#${row.section}`;
    out.links.set(
      `page:${path}`,
      href.assistantChat(chat.id, { sheet: 'chat', section: row.section }),
    );
    out.icons.set(`page:${path}`, 'sparkles');
    out.parents.set(`page:${path}`, `page:chat:${chat.id}`);
    return { path, title: row.title, description: chat.title, keywords: [...row.keywords] };
  });
}

const HARNESS_PAGES = [
  {
    title: 'Device',
    work: 'control',
    operation: 'device',
    keywords: ['execution host', 'switch device', 'computer', 'phone'],
  },
  {
    title: 'Supplier',
    work: 'overview',
    operation: 'model',
    keywords: ['model supplier', 'account', 'subscription'],
  },
  {
    title: 'Model and thinking',
    work: 'overview',
    operation: 'model',
    keywords: [
      'model',
      'thinking',
      'reasoning',
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
      'name',
      'intelligence',
      'latency',
      'input cost',
      'output cost',
      'largest context',
      'source details',
    ],
  },
  {
    title: 'Workspace',
    work: 'overview',
    keywords: ['directory', 'folder', 'workspace on target host'],
  },
  {
    title: 'Permissions',
    work: 'settings',
    keywords: [
      'recorded permissions',
      'sandbox',
      'approval',
      'full access',
      'read only',
      'workspace write',
    ],
  },
  {
    title: 'Questions',
    work: 'prompts',
    keywords: ['permissions and questions', 'questions', 'answer', 'approve'],
  },
];

function harnessPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return HARNESS_PAGES.map((row) => {
    const path = `chat:${chat.id}#harness:${row.title}`;
    out.links.set(
      `page:${path}`,
      href.assistantChat(chat.id, {
        work: row.work,
        ...(row.operation === undefined ? {} : { operation: row.operation }),
      }),
    );
    out.icons.set(`page:${path}`, 'wrench');
    out.parents.set(`page:${path}`, `page:chat:${chat.id}`);
    return {
      path,
      title: row.title,
      description: chat.title,
      keywords: [
        'SmartEverything',
        'harness',
        'session',
        'host',
        'route',
        'availability reported by the selected host',
        ...row.keywords,
      ],
    };
  });
}

function chatDetailPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return [...agentPages(chat, out), ...inspectorPages(chat, out), ...browserSearchPages(chat, out)];
}
