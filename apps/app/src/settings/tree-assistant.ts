import type { StoreState } from '../store/state';
import type { SettingEnv, SettingsPageDefinition } from './types';

const ownerOnly = (env: SettingEnv): boolean => env.owner;

function assistantSummary(state: StoreState): string | null {
  return state.assistant === null ? null : state.assistant.settings.name;
}

export const ASSISTANT_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'assistant',
    title: 'Assistant settings',
    icon: 'sparkles',
    parent: null,
    group: 'Connections',
    subPagesFirst: true,
    summary: assistantSummary,
    keywords: ['ai', 'chat', 'openrouter', 'api key', 'credits', 'default model'],
  },
  {
    id: 'assistant/models',
    title: 'Models',
    icon: 'brain',
    parent: 'assistant',
    group: null,
    keywords: [
      'catalogue',
      'prices',
      'favourites',
      'context',
      'refresh',
      'providers',
      'openrouter',
    ],
  },
  {
    id: 'assistant/costs',
    title: 'Costs',
    icon: 'trendUp',
    parent: 'assistant',
    group: null,
    keywords: ['costs', 'ai usage', 'usage', 'spend', 'tokens', 'credits', 'billing', 'openrouter'],
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
    id: 'assistant/calls',
    title: 'Call audio and video',
    icon: 'audioLines',
    parent: 'assistant',
    group: null,
    subtitle: 'Echo, voice detection, microphone, speaker and what it sees',
    keywords: [
      'voice calls',
      'echo',
      'headphones',
      'microphone',
      'speaker',
      'video call',
      'screen share',
      'camera',
      'call settings',
    ],
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
