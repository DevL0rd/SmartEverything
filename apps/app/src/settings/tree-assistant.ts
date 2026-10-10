import { ENGINE_LABELS } from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import { joinParts } from '../format/text';
import type { StoreState } from '../store/state';
import type { SettingEnv, SettingsPageDefinition } from './types';

const ownerOnly = (env: SettingEnv): boolean => env.owner;

function backendLabel(state: StoreState): string | null {
  const status = state.assistant;
  return status === null ? null : ENGINE_LABELS[status.settings.default_engine];
}

function assistantSummary(state: StoreState): string | null {
  return state.assistant === null
    ? null
    : joinParts([state.assistant.settings.name, backendLabel(state)]);
}

export const ASSISTANT_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'assistant',
    title: 'Assistant settings',
    icon: 'sparkles',
    parent: null,
    group: null,
    subPagesFirst: true,
    summary: assistantSummary,
    keywords: ['ai', 'chat', 'ai backend', 'openrouter', 'claude code', 'codex'],
  },
  {
    id: 'assistant/responder',
    title: 'AI backend',
    icon: 'cpu',
    parent: 'assistant',
    group: null,
    summary: backendLabel,
    childrenInline: false,
    keywords: ['ai backend', 'openrouter', 'claude code', 'codex', 'who answers'],
  },
  {
    id: 'assistant/claude-code',
    title: 'Claude Code',
    icon: 'cpu',
    parent: 'assistant/responder',
    group: null,
    keywords: ['claude code', 'claude desktop', 'connect', 'repair', 'default model'],
  },
  {
    id: 'assistant/codex',
    title: 'Codex',
    icon: 'cpu',
    parent: 'assistant/responder',
    group: null,
    keywords: ['codex', 'openai', 'connect', 'repair', 'default model'],
  },
  {
    id: 'assistant/openrouter',
    title: 'OpenRouter',
    icon: 'sparkles',
    parent: 'assistant/responder',
    group: null,
    childrenInline: false,
    keywords: ['openrouter', 'api key', 'credits', 'top up', 'models', 'costs', 'default model'],
  },
  {
    id: 'assistant/openrouter/key',
    title: 'API key',
    icon: 'key',
    parent: 'assistant/openrouter',
    group: null,
    keywords: ['api key', 'paste', 'discordinator', 'import', 'remove key', 'key limit'],
  },
  {
    id: 'assistant/openrouter/models',
    title: 'Models',
    icon: 'brain',
    parent: 'assistant/openrouter',
    group: null,
    keywords: ['catalogue', 'prices', 'favourites', 'context', 'refresh'],
  },
  {
    id: 'assistant/costs',
    title: 'Costs',
    icon: 'trendUp',
    parent: 'assistant',
    group: null,
    href: href.assistantCosts(),
    keywords: ['costs', 'ai usage', 'spend', 'tokens', 'credits', 'billing'],
  },
  {
    id: 'assistant/budget',
    title: 'AI budget',
    icon: 'gauge',
    parent: 'assistant',
    group: null,
    keywords: ['budget', 'limit', 'spending alert', 'spike', 'low credits', 'pause background ai'],
  },
  {
    id: 'assistant/reach',
    title: 'Reaching you',
    icon: 'phone',
    parent: 'assistant',
    group: null,
    subtitle: 'Quiet hours and the cameras the AI may talk through',
    keywords: ['reaching you', 'ai calls', 'quiet hours', 'camera speaker', 'call me'],
  },
  {
    id: 'assistant/privacy',
    title: 'Chat privacy',
    icon: 'shield',
    parent: 'assistant',
    group: null,
    keywords: ['clear history', 'delete messages'],
  },
  {
    id: 'assistant/integrations',
    title: 'Integrations',
    icon: 'puzzle',
    parent: 'assistant',
    group: null,
    subtitle: 'Let other AI apps use SmartEverything',
    keywords: ['ai assistants', 'claude', 'chatgpt', 'cursor', 'vs code', 'mcp', 'connect'],
    visible: ownerOnly,
  },
  {
    id: 'assistant/integrations/tools',
    title: 'Exposed tools',
    icon: 'wrench',
    parent: 'assistant/integrations',
    group: null,
    keywords: ['mcp tools'],
    visible: ownerOnly,
  },
  {
    id: 'assistant/integrations/tokens',
    title: 'Personal tokens',
    icon: 'key',
    parent: 'assistant/integrations',
    group: null,
    keywords: ['token', 'api key'],
    visible: ownerOnly,
  },
];
