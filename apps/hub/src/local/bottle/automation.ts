import { BOTTLE_DRIVER } from '@smarteverything/domain';
import type { PluginKindCatalog } from '../../automations/plugin-kinds/catalog';
import {
  registerDriverAutomation,
  type DriverAutomationInput,
} from '../../automations/plugin-kinds/contributions';
import {
  automation,
  eventTrigger,
  ports,
  type PortKind,
} from '../../plugins/builtin/automation-kit';

const BOTTLE_NAME = 'LARQ PureVis 2 bottle';

const BOTTLE: PortKind<string> = { type: { t: 'ref', of: 'device', families: ['bottle'] } };

function maybe<V>(kind: PortKind<V>): PortKind<V | undefined> {
  return { type: { t: 'optional', of: kind.type } };
}

const BOTTLE_FILTER = {
  kind: BOTTLE,
  title: 'Bottle',
  description: 'Only this bottle.',
  match: 'subject',
} as const;

const PERSON_FILTER = {
  kind: ports.ref('person'),
  title: 'Person',
  description: 'Only this person.',
  match: 'profileId',
} as const;

const MILLILITRES = ports.number({ integer: true, min: 0, unit: 'ml' });

const PERCENT = ports.number({ min: 0, max: 100, unit: '%' });

const DRANK = eventTrigger({
  id: 'drink',
  version: 1,
  title: 'Drank from the bottle',
  description: 'Fires when a drink from the bottle is recorded.',
  icon: 'glassWater',
  keywords: ['bottle', 'larq', 'drink', 'water', 'hydration', 'sip'],
  summary: '{person} drank from {bottle}',
  event: { deviceEvent: 'activity', activity: 'drink' },
  filters: { bottle: BOTTLE_FILTER, person: PERSON_FILTER },
  outputs: {
    ml: { kind: MILLILITRES, title: 'Millilitres drunk', from: 'ml' },
    levelMl: { kind: MILLILITRES, title: 'Millilitres left in the bottle', from: 'levelMl' },
    person: { kind: maybe(ports.ref('person')), title: 'Person', from: 'profileId' },
  },
});

const REFILLED = eventTrigger({
  id: 'refill',
  version: 1,
  title: 'Refilled the bottle',
  description: 'Fires when the bottle is filled up.',
  icon: 'droplet',
  keywords: ['bottle', 'larq', 'refill', 'fill', 'water'],
  summary: '{bottle} was refilled',
  event: { deviceEvent: 'activity', activity: 'refill' },
  filters: { bottle: BOTTLE_FILTER },
  outputs: {
    ml: { kind: MILLILITRES, title: 'Millilitres added', from: 'ml' },
    levelMl: { kind: MILLILITRES, title: 'Millilitres in the bottle', from: 'levelMl' },
  },
});

const GOAL_REACHED = eventTrigger({
  id: 'goal_reached',
  version: 1,
  title: 'Reached the water goal',
  description: 'Fires when the water drunk from the bottle today reaches the daily goal.',
  icon: 'glassWater',
  keywords: ['bottle', 'larq', 'goal', 'hydration', 'water', 'daily'],
  summary: '{person} reached the water goal with {bottle}',
  event: { deviceEvent: 'activity', activity: 'goal_reached' },
  filters: { bottle: BOTTLE_FILTER, person: PERSON_FILTER },
  outputs: {
    ml: { kind: MILLILITRES, title: 'Millilitres drunk today', from: 'ml' },
    goalMl: { kind: MILLILITRES, title: 'Daily goal in millilitres', from: 'goalMl' },
    person: { kind: maybe(ports.ref('person')), title: 'Person', from: 'profileId' },
  },
});

const UV_CLEAN_DONE = eventTrigger({
  id: 'uv_clean_done',
  version: 1,
  title: 'The bottle finished a UV clean',
  description: 'Fires when the cap has finished cleaning the bottle with UV light.',
  icon: 'sparkles',
  keywords: ['bottle', 'larq', 'uv', 'clean', 'purevis', 'sterilise'],
  summary: '{bottle} finished a UV clean',
  event: { deviceEvent: 'activity', activity: 'uv_clean' },
  filters: { bottle: BOTTLE_FILTER },
  outputs: {
    mode: { kind: ports.text(), title: 'Clean mode', from: 'mode' },
    battery: { kind: maybe(PERCENT), title: 'Battery left', from: 'socPct' },
  },
});

const CHARGING_STARTED = eventTrigger({
  id: 'charging_started',
  version: 1,
  title: 'The bottle started charging',
  description: 'Fires when the cap is put on its charger.',
  icon: 'battery',
  keywords: ['bottle', 'larq', 'charging', 'charger', 'battery'],
  summary: '{bottle} started charging',
  event: { deviceEvent: 'activity', activity: 'charging_started' },
  filters: { bottle: BOTTLE_FILTER },
  outputs: { battery: { kind: maybe(PERCENT), title: 'Battery', from: 'pct' } },
});

const CHARGING_FINISHED = eventTrigger({
  id: 'charging_finished',
  version: 1,
  title: 'The bottle finished charging',
  description: 'Fires when the cap battery is full.',
  icon: 'battery',
  keywords: ['bottle', 'larq', 'charged', 'full', 'battery'],
  summary: '{bottle} finished charging',
  event: { deviceEvent: 'activity', activity: 'charging_finished' },
  filters: { bottle: BOTTLE_FILTER },
  outputs: { battery: { kind: maybe(PERCENT), title: 'Battery', from: 'pct' } },
});

export const BOTTLE_AUTOMATION: DriverAutomationInput = {
  id: BOTTLE_DRIVER,
  name: BOTTLE_NAME,
  icon: 'glassWater',
  version: '1',
  automation: automation({
    triggers: [DRANK, REFILLED, GOAL_REACHED, UV_CLEAN_DONE, CHARGING_STARTED, CHARGING_FINISHED],
  }),
};

export function registerBottleAutomation(
  catalog: Pick<PluginKindCatalog, 'replace' | 'remove'>,
): () => void {
  return registerDriverAutomation(catalog, BOTTLE_AUTOMATION);
}
