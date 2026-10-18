import { CODEX_OPERATIONS } from '../features/assistant/provider/codex-operations';
import { schemaOf } from '../components/schema-values';
import type { SearchSources } from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import { PROVIDER_OPERATIONS } from '../features/assistant/provider/provider-operations';
import { WORK_TABS } from '../features/assistant/provider/work-tabs';
import { chatDetailPages } from './chat-detail-pages';
import type { SearchChat, SourceLinks } from './sources';

export function chatProviderPages(
  chat: SearchChat,
  out: SourceLinks,
  owner: boolean,
): SearchSources['pages'] {
  const details = chatDetailPages(chat, out);
  if (chat.runtime === 'dsh') return [...details, ...harnessPages(chat, out)];
  if (!chat.computer || !owner) return details;
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
    ...details,
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

const HARNESS_PAGES = [
  {
    title: 'Device',
    work: 'control',
    operation: 'device',
    keywords: ['execution host', 'switch device', 'computer', 'phone'],
  },
  {
    title: 'Workspace',
    work: 'overview',
    keywords: ['directory', 'folder', 'workspace on target host'],
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
