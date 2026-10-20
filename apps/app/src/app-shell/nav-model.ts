import type { Href } from 'expo-router';
import type { NavPin, ResolvedEntry, ResolvedNav, ResolvedNode } from '@smarteverything/domain';
import type { IconName } from '../components/icon';
import type { Availability } from '../store/selectors';
import { navTargetHref, navTargetKey, type TargetFacts } from './nav-targets';
import { TAB_ROUTES } from './routes';
import type { RouteDefinition, TabKey } from './route-types';

interface NavEntryFace {
  readonly key: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly icon: IconName;
  readonly active: boolean;
  readonly badge: 'critical' | null;
  readonly count: number;
  readonly missing: boolean;
}

export interface NavSectionEntry extends NavEntryFace {
  readonly kind: 'section';
  readonly node: Extract<ResolvedEntry, { readonly kind: 'section' }> | null;
  readonly href: Href;
  readonly tab: TabKey;
}

export interface NavPinEntry extends NavEntryFace {
  readonly kind: 'pin';
  readonly node: Extract<ResolvedEntry, { readonly kind: 'pin' }>;
  readonly href: Href | null;
  readonly tab: null;
}

export type NavEntry = NavSectionEntry | NavPinEntry;

export interface NavFolderView {
  readonly kind: 'folder';
  readonly key: string;
  readonly title: string;
  readonly icon: IconName;
  readonly items: readonly NavEntry[];
  readonly open: boolean;
  readonly active: boolean;
}

export type NavNodeView = NavEntry | NavFolderView;

export interface NavModel {
  readonly nodes: readonly NavNodeView[];
  readonly bar: readonly NavNodeView[];
  readonly overflow: readonly NavNodeView[];
  readonly hidden: readonly NavSectionEntry[];
  readonly system: readonly NavSectionEntry[];
  readonly orb: NavSectionEntry | null;
  readonly sheetActive: boolean;
}

export interface NavModelInput {
  readonly resolved: ResolvedNav;
  readonly facts: ReadonlyMap<string, TargetFacts>;
  readonly availability: Availability;
  readonly unread: number;
  readonly current: TabKey;
  readonly leaf: string;
  readonly openFolders: readonly string[];
}

const ORB = 'assistant';
const REMOVED_TITLE = 'Removed item';

function route(tab: TabKey): RouteDefinition {
  const found = TAB_ROUTES.find((candidate) => candidate.tab === tab);
  if (found === undefined) {
    throw new Error(`The tab ${tab} has no route definition.`);
  }
  return found;
}

function pinMatchesLeaf(pin: NavPin, leaf: string): boolean {
  return pin.target.kind !== 'section' && navTargetKey(pin.target) === leaf;
}

function leafIsPinned(nodes: readonly ResolvedNode[], leaf: string): boolean {
  return nodes.some((node) => {
    if (node.kind === 'pin') return !node.missing && pinMatchesLeaf(node.pin, leaf);
    return (
      node.kind === 'folder' &&
      node.items.some(
        (entry) => entry.kind === 'pin' && !entry.missing && pinMatchesLeaf(entry.pin, leaf),
      )
    );
  });
}

function sectionEntry(
  tab: TabKey,
  node: NavSectionEntry['node'],
  input: NavModelInput,
  pinned: boolean,
): NavSectionEntry {
  const definition = route(tab);
  return {
    kind: 'section',
    key: node?.key ?? `section:${tab}`,
    node,
    title: definition.title,
    shortTitle: definition.shortTitle ?? definition.title,
    icon: definition.icon,
    href: definition.href,
    tab,
    active: !pinned && tab === input.current,
    badge: definition.badge?.(input.availability) ?? null,
    count: tab === ORB ? input.unread : 0,
    missing: false,
  };
}

function pinActive(pin: NavPin, input: NavModelInput): boolean {
  return pin.target.kind === 'section'
    ? pin.target.section === input.current
    : pinMatchesLeaf(pin, input.leaf);
}

function pinFace(
  pin: NavPin,
  facts: TargetFacts | undefined,
): Pick<NavEntryFace, 'title' | 'icon' | 'count'> {
  return {
    title: pin.title ?? facts?.title ?? REMOVED_TITLE,
    icon: pin.icon ?? facts?.icon ?? 'info',
    count: facts?.count ?? 0,
  };
}

function pinEntry(node: NavPinEntry['node'], input: NavModelInput): NavPinEntry {
  const { pin } = node;
  const href = navTargetHref(pin.target);
  const missing = node.missing || href === null;
  const face = pinFace(pin, input.facts.get(navTargetKey(pin.target)));
  return {
    kind: 'pin',
    key: node.key,
    node,
    ...face,
    shortTitle: face.title,
    href,
    tab: null,
    active: !missing && pinActive(pin, input),
    badge: null,
    missing,
  };
}

function entryView(node: ResolvedEntry, input: NavModelInput, pinned: boolean): NavEntry {
  return node.kind === 'section'
    ? sectionEntry(node.section, node, input, pinned)
    : pinEntry(node, input);
}

function nodeView(node: ResolvedNode, input: NavModelInput, pinned: boolean): NavNodeView {
  if (node.kind !== 'folder') return entryView(node, input, pinned);
  const items = node.items.map((entry) => entryView(entry, input, pinned));
  return {
    kind: 'folder',
    key: node.key,
    title: node.folder.title,
    icon: node.folder.icon,
    items,
    open: input.openFolders.includes(node.key),
    active: items.some((entry) => entry.active),
  };
}

function orbEntry(input: NavModelInput, pinned: boolean): NavSectionEntry | null {
  if (!route(ORB).available(input.availability)) return null;
  return sectionEntry(ORB, { kind: 'section', key: `section:${ORB}`, section: ORB }, input, pinned);
}

function isActive(node: NavNodeView): boolean {
  return node.active;
}

export function navModel(input: NavModelInput): NavModel {
  const { resolved } = input;
  const pinned = leafIsPinned(resolved.nodes, input.leaf);
  const views = new Map(
    resolved.nodes.map((node) => [node.key, nodeView(node, input, pinned)] as const),
  );
  const viewsOf = (nodes: readonly ResolvedNode[]): readonly NavNodeView[] =>
    nodes.flatMap((node) => views.get(node.key) ?? []);
  const bar = viewsOf(resolved.barSlots);
  const orb = orbEntry(input, pinned);
  return {
    nodes: viewsOf(resolved.nodes),
    bar,
    overflow: viewsOf(resolved.overflow),
    hidden: resolved.hidden.map((section) =>
      sectionEntry(section, { kind: 'section', key: `section:${section}`, section }, input, true),
    ),
    system: [sectionEntry('settings', null, input, pinned)],
    orb,
    sheetActive: orb?.active !== true && !bar.some(isActive),
  };
}

export function leafEntries(nodes: readonly NavNodeView[]): readonly NavEntry[] {
  return nodes.flatMap((node) => (node.kind === 'folder' ? node.items : [node]));
}

const ROUTE_NAME_OVERRIDES: Partial<Record<TabKey, string>> = { assistant: '(z-assistant)' };

export function routeNameOfTab(tab: TabKey): string {
  return ROUTE_NAME_OVERRIDES[tab] ?? `(${tab})`;
}

export function tabOfRouteName(name: string): TabKey | null {
  return TAB_ROUTES.find((candidate) => routeNameOfTab(candidate.tab) === name)?.tab ?? null;
}
