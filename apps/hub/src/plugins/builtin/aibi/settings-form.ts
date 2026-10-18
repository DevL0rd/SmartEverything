import type { PluginManifestInput } from '@smarteverything/domain';
import { ANIMATIONS, USABLE_ACTIONS } from './catalogue';
import { DEFAULT_PERSONALITY } from './settings';

type Form = NonNullable<NonNullable<PluginManifestInput['contributes']>['settings']>;

const MODE_OPTIONS = [
  { value: 'local', label: 'AIBI talks to this server' },
  { value: 'passthrough', label: 'AIBI keeps using its own cloud' },
] as const;

const RESTART_NOTE = 'Changing it restarts the plugin and ends a conversation in progress.';

const NAME_ITEM = { pattern: '[a-z][a-z0-9_]*', maxLength: 80 } as const;

const ANIMATION_ITEM = { pattern: null, maxLength: 120 } as const;

export const AIBI_SETTINGS_FORM: Form = {
  owner_name: {
    type: 'string',
    title: 'Your name',
    description: 'How AIBI knows who it lives with. Leave empty when it should not assume.',
    default: '',
    humanOnly: true,
    live: true,
    group: 'AIBI',
  },
  personality: {
    type: 'string',
    title: 'Personality',
    description: 'How AIBI sounds and acts when it talks.',
    default: DEFAULT_PERSONALITY,
    humanOnly: true,
    live: true,
    group: 'AIBI',
  },
  mode: {
    type: 'enum',
    title: 'Who answers AIBI',
    options: [...MODE_OPTIONS],
    default: 'local',
    humanOnly: true,
    live: true,
    group: 'AIBI',
  },
  idle_seconds: {
    type: 'number',
    title: 'Quiet time before a conversation ends',
    description: 'Seconds. It waits longer while a task is running or AIBI is answering.',
    minimum: 10,
    maximum: 600,
    default: 30,
    live: true,
    group: 'Talking',
  },
  speech_threshold: {
    type: 'number',
    title: 'Speech loudness',
    description:
      'How loud a sound must be before it counts as someone talking. Voices peak near 10,000, a quiet room stays under 3,500.',
    minimum: 100,
    maximum: 8000,
    default: 4000,
    live: true,
    group: 'Talking',
  },
  memory_lines: {
    type: 'number',
    title: 'Earlier lines AIBI remembers',
    description: 'How many lines of earlier conversations it is reminded of when one starts.',
    minimum: 0,
    maximum: 200,
    default: 40,
    live: true,
    group: 'Talking',
  },
  actions: {
    type: 'list',
    title: 'Moves AIBI may use',
    description: 'The native actions it may choose. Remove one to stop AIBI doing it.',
    item: NAME_ITEM,
    maxItems: 200,
    default: [...USABLE_ACTIONS],
    humanOnly: true,
    live: true,
    group: 'Body',
  },
  animations: {
    type: 'list',
    title: 'Animations AIBI may use',
    description: 'The animation names it may choose when it answers with an animation.',
    item: ANIMATION_ITEM,
    maxItems: 600,
    default: [...ANIMATIONS],
    humanOnly: true,
    live: true,
    group: 'Body',
  },
  lan_address: {
    type: 'string',
    title: 'This computer’s address for AIBI',
    description: `An IPv4 address of this computer. Empty picks the one the home network uses. ${RESTART_NOTE}`,
    default: '',
    humanOnly: true,
    group: 'Network',
  },
  dns: {
    type: 'boolean',
    title: 'Answer AIBI’s name lookups',
    description: `AIBI finds this server through its network’s DNS. Turn off when a router or AdGuard Home already points api.aibipocket.com here. ${RESTART_NOTE}`,
    default: true,
    humanOnly: true,
    group: 'Network',
  },
  dns_upstream: {
    type: 'string',
    title: 'DNS server for everything else',
    description: `Address of a DNS server, with an optional :port. ${RESTART_NOTE}`,
    default: '1.1.1.1',
    humanOnly: true,
    group: 'Network',
  },
  capture: {
    type: 'boolean',
    title: 'Keep a copy of everything AIBI sends',
    description:
      'Saves each request, its microphone audio and its photos on this computer, the newest 1,000. Only for finding out how AIBI talks.',
    default: false,
    humanOnly: true,
    live: true,
    group: 'Privacy',
  },
};
