import type { Href } from 'expo-router';
import type {
  AutomationFunctionSummary,
  AutomationSecretEntry,
  KindLookup,
} from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import type { RouteDefinition } from '../../app-shell/route-types';
import type { IconName } from '../../components/icon';
import { FLOWCHART_KEYWORDS, focusTargetsOf } from './model/consumers/search-entries';
import type { ConsumerRow } from './model/consumers/row';

const always = (): boolean => true;

export type EditorActionFocus = 'action:test' | 'action:publish' | 'action:make-reusable';

function query(params: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export const links = {
  list: (): Href => '/automations',
  create: (template?: string): Href =>
    template === undefined
      ? '/automations/new'
      : { pathname: '/automations/new', params: { template } },
  detail: (automationId: string): Href => ({
    pathname: '/automations/[automationId]',
    params: { automationId },
  }),
  edit: (automationId: string, focus?: string): Href => ({
    pathname: '/automations/[automationId]/edit',
    params: { automationId, ...query({ focus }) },
  }),
  nodes: (): Href => '/automations/nodes',
  node: (functionId: string): Href => ({
    pathname: '/automations/nodes/[functionId]',
    params: { functionId },
  }),
  nodeEdit: (functionId: string, focus?: string): Href => ({
    pathname: '/automations/nodes/[functionId]/edit',
    params: { functionId, ...query({ focus }) },
  }),
  templates: (): Href => '/automations/templates',
  secrets: (): Href => '/automations/secrets',
  variables: (): Href => '/automations/variables',
  variable: (variableId: string): Href => ({
    pathname: '/automations/variables/[variableId]',
    params: { variableId },
  }),
  runs: (): Href => href.automationRuns(),
  schedule: (): Href => href.automationSchedule(),
  scheduled: (): Href => href.scheduled(),
  scenes: (): Href => href.scenes(),
};

export const AUTOMATIONS_ACTIONS: NonNullable<RouteDefinition['actions']> = [
  {
    key: 'new',
    title: 'New automation',
    icon: 'plus',
    href: links.create(),
    keywords: ['create', 'add', 'rule', 'make', 'build'],
  },
  {
    key: 'from-template',
    title: 'New automation from a template',
    icon: 'layers',
    href: links.templates(),
    keywords: ['template', 'idea', 'start', 'example', 'create', 'add'],
  },
];

export const ROUTES: readonly RouteDefinition[] = [
  {
    key: 'automations.nodes',
    href: links.nodes(),
    title: 'Custom Nodes',
    icon: 'box',
    tab: 'automations',
    parent: 'automations',
    keywords: ['reusable', 'node', 'nodes', 'steps', 'inputs', 'function', 'library', 'value'],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'new',
        title: 'New Custom Node',
        icon: 'plus',
        href: links.nodes(),
        keywords: ['create', 'add', 'make', 'reuse', 'build'],
      },
    ],
  },
  {
    key: 'automations.templates',
    href: links.templates(),
    title: 'Templates',
    icon: 'layers',
    tab: 'automations',
    parent: 'automations',
    keywords: ['template', 'ideas', 'examples', 'start', 'suggestions', 'recipes'],
    available: always,
    searchable: true,
  },
  {
    key: 'automations.variables',
    href: links.variables(),
    title: 'Variables',
    icon: 'customize',
    tab: 'automations',
    parent: 'automations',
    keywords: [
      'values',
      'variables',
      'remember',
      'number',
      'duration',
      'choice',
      'toggle',
      'cycle',
      'bounds',
    ],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'new',
        title: 'New variable',
        icon: 'plus',
        href: links.variable('new'),
        keywords: ['create', 'add', 'value', 'remember'],
      },
    ],
  },
  {
    key: 'automations.scenes',
    href: links.scenes(),
    title: 'Scenes',
    icon: 'sparkles',
    tab: 'automations',
    parent: 'automations',
    keywords: ['scene', 'mood', 'preset', 'movie', 'bedtime'],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'new',
        title: 'New scene',
        icon: 'plus',
        href: href.scene('new'),
        keywords: ['create', 'add', 'make'],
      },
    ],
  },
  {
    key: 'automations.schedule',
    href: links.schedule(),
    title: 'Week view',
    icon: 'calendar',
    tab: 'automations',
    parent: 'automations',
    keywords: ['schedule', 'calendar', 'timer', 'week', 'next', 'when'],
    available: always,
    searchable: true,
  },
  {
    key: 'automations.scheduled',
    href: links.scheduled(),
    title: 'One-off timers',
    icon: 'timer',
    tab: 'automations',
    parent: 'automations',
    keywords: [
      'scheduled',
      'timer',
      'later',
      'delay',
      'once',
      'countdown',
      'turn off in',
      'in minutes',
      'one-off',
    ],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'new',
        title: 'Schedule an action',
        icon: 'plus',
        href: href.scheduledNew(),
        keywords: ['create', 'add', 'timer', 'later', 'delay'],
      },
    ],
  },
  {
    key: 'automations.runs',
    href: links.runs(),
    title: 'Run history',
    icon: 'activity',
    tab: 'automations',
    parent: 'automations',
    keywords: ['log', 'ran', 'failed', 'history', 'runs', 'trace'],
    available: always,
    searchable: true,
  },
  {
    key: 'automations.secrets',
    href: links.secrets(),
    title: 'Secrets',
    icon: 'key',
    tab: 'automations',
    parent: 'automations',
    keywords: ['secret', 'key', 'token', 'password', 'credential', 'web request', 'api', 'auth'],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'new',
        title: 'Add a secret',
        icon: 'plus',
        href: links.secrets(),
        keywords: ['create', 'add', 'new', 'replace', 'token', 'key'],
        ownerOnly: true,
      },
    ],
  },
];

export interface AutomationSearchPage {
  readonly path: string;
  readonly title: string;
  readonly parent: string;
  readonly to: Href;
  readonly icon: IconName;
  readonly keywords: readonly string[];
}

export interface AutomationSearchSources {
  readonly automations: readonly ConsumerRow[];
  readonly functions: readonly AutomationFunctionSummary[];
  readonly secrets: readonly AutomationSecretEntry[];
  readonly kinds: KindLookup;
}

interface EditorEntry {
  readonly key: string;
  readonly title: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
  readonly focus?: EditorActionFocus;
}

const EDITOR_ENTRIES: readonly EditorEntry[] = [
  {
    key: 'flowchart',
    title: 'Flowchart',
    icon: 'route',
    keywords: FLOWCHART_KEYWORDS,
  },
  {
    key: 'test',
    title: 'Test',
    icon: 'play',
    keywords: ['test', 'dry run', 'try', 'simulate', 'debug', 'breakpoint'],
    focus: 'action:test',
  },
  {
    key: 'publish',
    title: 'Publish',
    icon: 'upload',
    keywords: ['publish', 'save', 'go live', 'draft', 'versions'],
    focus: 'action:publish',
  },
  {
    key: 'make-reusable',
    title: 'Make Custom Node',
    icon: 'box',
    keywords: ['reusable', 'node', 'extract', 'function', 'reuse', 'selection'],
    focus: 'action:make-reusable',
  },
];

function automationPages(row: ConsumerRow, kinds: KindLookup): readonly AutomationSearchPage[] {
  const base = `automation-editor:${row.id}`;
  const parent = `automation:${row.id}`;
  const entries = EDITOR_ENTRIES.map((entry) => ({
    path: `${base}:${entry.key}`,
    title: entry.title,
    parent,
    to: links.edit(row.id, entry.focus),
    icon: entry.icon,
    keywords: entry.keywords,
  }));
  const targets = focusTargetsOf(row.definition, kinds).map((target) => ({
    path: `${base}:${target.key}`,
    title: target.title,
    parent,
    to: links.edit(row.id, target.focus),
    icon: 'customize' as const,
    keywords: target.keywords,
  }));
  return [...entries, ...targets];
}

function interfaceWords(summary: AutomationFunctionSummary): readonly string[] {
  const { inputs, outputs, exits, flavour } = summary.interface;
  return [
    flavour === 'pure' ? 'value' : 'step',
    ...inputs.flatMap((input) => [input.name, ...(input.label === undefined ? [] : [input.label])]),
    ...outputs.flatMap((output) => [
      output.name,
      ...(output.label === undefined ? [] : [output.label]),
    ]),
    ...exits,
  ];
}

function nodePages(summary: AutomationFunctionSummary): readonly AutomationSearchPage[] {
  const path = `automation-node:${summary.id}`;
  const page: AutomationSearchPage = {
    path,
    title: summary.name,
    parent: 'page:automations.nodes',
    to: links.node(summary.id),
    icon: 'box',
    keywords: [
      'reusable',
      'node',
      ...(summary.category === null ? [] : [summary.category]),
      ...(summary.description === null ? [] : [summary.description]),
      ...interfaceWords(summary),
    ],
  };
  if (!summary.editable) return [page];
  return [
    page,
    {
      path: `${path}:edit`,
      title: `Edit ${summary.name}`,
      parent: `page:${path}`,
      to: links.nodeEdit(summary.id),
      icon: 'customize',
      keywords: ['edit', 'change', 'interface', 'inputs', 'outputs'],
    },
  ];
}

function secretPage(secret: AutomationSecretEntry): AutomationSearchPage {
  return {
    path: `automation-secret:${secret.id}`,
    title: secret.name,
    parent: 'page:automations.secrets',
    to: links.secrets(),
    icon: 'key',
    keywords: ['secret', 'key', 'token', 'credential', 'replace', 'remove', 'web request'],
  };
}

export function automationSearchPages(
  sources: AutomationSearchSources,
): readonly AutomationSearchPage[] {
  return [
    ...sources.automations.flatMap((row) => automationPages(row, sources.kinds)),
    ...sources.functions.flatMap(nodePages),
    ...sources.secrets.map(secretPage),
  ];
}
