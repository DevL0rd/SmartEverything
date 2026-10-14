import type { NavKind } from '../design/size-class';
import type { Availability } from '../store/selectors';
import { TAB_ROUTES } from './routes';
import { PAGE_ORDER } from './main-pages';
import type { RouteDefinition, TabKey } from './route-types';

export interface NavEntry {
  readonly route: RouteDefinition;
  readonly active: boolean;
  readonly badge: 'critical' | null;
  readonly count: number;
}

export interface NavModel {
  readonly pages: readonly NavEntry[];
  readonly system: readonly NavEntry[];
  readonly orb: NavEntry | null;
}

const BAR_PAGES = 4;
const ORB: TabKey = 'assistant';

function route(tab: TabKey): RouteDefinition {
  const found = TAB_ROUTES.find((candidate) => candidate.tab === tab);
  if (found === undefined) {
    throw new Error(`The tab ${tab} has no route definition.`);
  }
  return found;
}

function entry(tab: TabKey, current: TabKey, availability: Availability, unread: number): NavEntry {
  const definition = route(tab);
  return {
    route: definition,
    active: tab === current,
    badge: definition.badge?.(availability) ?? null,
    count: tab === ORB ? unread : 0,
  };
}

function availablePages(availability: Availability): readonly TabKey[] {
  return PAGE_ORDER.filter((tab) => route(tab).available(availability));
}

function barModel(current: TabKey, availability: Availability, unread: number): NavModel {
  const pages = availablePages(availability)
    .filter((tab) => tab !== ORB)
    .slice(0, BAR_PAGES);
  return {
    pages: pages.map((tab) => entry(tab, current, availability, unread)),
    system: [],
    orb: entry(ORB, current, availability, unread),
  };
}

export function directoryModel(
  current: TabKey,
  availability: Availability,
  unread: number,
): NavModel {
  return {
    pages: availablePages(availability).map((tab) => entry(tab, current, availability, unread)),
    system: [entry('settings', current, availability, unread)],
    orb: null,
  };
}

export function navModel(
  kind: NavKind,
  current: TabKey,
  availability: Availability,
  unread: number,
): NavModel {
  return kind === 'bar'
    ? barModel(current, availability, unread)
    : directoryModel(current, availability, unread);
}

export function navEntries(model: NavModel): readonly NavEntry[] {
  return [...model.pages, ...model.system];
}

const ROUTE_NAME_OVERRIDES: Partial<Record<TabKey, string>> = { assistant: '(z-assistant)' };

export function routeNameOfTab(tab: TabKey): string {
  return ROUTE_NAME_OVERRIDES[tab] ?? `(${tab})`;
}

export function tabOfRouteName(name: string): TabKey | null {
  return TAB_ROUTES.find((candidate) => routeNameOfTab(candidate.tab) === name)?.tab ?? null;
}
