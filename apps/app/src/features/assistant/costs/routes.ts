import type { RouteDefinition } from '../../../app-shell/route-types';

export const ROUTES: readonly RouteDefinition[] = [
  {
    key: 'assistant-costs',
    href: '/assistant/costs',
    title: 'Costs',
    icon: 'trendUp',
    tab: 'assistant',
    parent: 'assistant',
    keywords: [
      'costs',
      'usage',
      'spend',
      'credits',
      'tokens',
      'openrouter',
      'budget',
      'billing',
      'ai',
    ],
    available: () => true,
    searchable: true,
  },
];
