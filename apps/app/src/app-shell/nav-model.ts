import type { NavKind } from '../design/size-class';
import type { Availability } from '../store/selectors';
import { TAB_ROUTES } from './routes';
import type { RouteDefinition, TabKey } from './route-types';

export interface NavEntry {
  readonly route: RouteDefinition;
  readonly active: boolean;
  readonly badge: 'critical' | null;
}

export interface NavModel {
  readonly pages: readonly NavEntry[];
  readonly system: readonly NavEntry[];
  readonly orb: NavEntry | null;
}

const PAGE_ORDER: readonly TabKey[] = [
  'home',
  'devices',
  'cameras',
  'fitness',
  'assistant',
  'talk',
  'automations',
];
const BAR_PAGES = 4;
const ORB: TabKey = 'assistant';

function route(tab: TabKey): RouteDefinition {
  const found = TAB_ROUTES.find((candidate) => candidate.tab === tab);
  if (found === undefined) {
    throw new Error(`The tab ${tab} has no route definition.`);
  }
  return found;
}

function entry(tab: TabKey, current: TabKey, availability: Availability): NavEntry {
  const definition = route(tab);
  return {
    route: definition,
    active: tab === current,
    badge: definition.badge?.(availability) ?? null,
  };
}

function availablePages(availability: Availability): readonly TabKey[] {
  return PAGE_ORDER.filter((tab) => route(tab).available(availability));
}

function barModel(current: TabKey, availability: Availability): NavModel {
  const pages = availablePages(availability)
    .filter((tab) => tab !== ORB)
    .slice(0, BAR_PAGES);
  return {
    pages: pages.map((tab) => entry(tab, current, availability)),
    system: [],
    orb: entry(ORB, current, availability),
  };
}

export function directoryModel(current: TabKey, availability: Availability): NavModel {
  return {
    pages: availablePages(availability).map((tab) => entry(tab, current, availability)),
    system: [entry('settings', current, availability)],
    orb: null,
  };
}

export function navModel(kind: NavKind, current: TabKey, availability: Availability): NavModel {
  return kind === 'bar' ? barModel(current, availability) : directoryModel(current, availability);
}

export function navEntries(model: NavModel): readonly NavEntry[] {
  return [...model.pages, ...model.system];
}

export function tabOfRouteName(name: string): TabKey | null {
  const match =
    /^\((home|devices|cameras|fitness|assistant|automations|talk|settings|more)\)$/.exec(name);
  const tab = match?.[1];
  return TAB_ROUTES.find((candidate) => candidate.tab === tab)?.tab ?? null;
}
