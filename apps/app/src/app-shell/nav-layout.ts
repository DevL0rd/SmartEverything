import { useEffect, useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  DEFAULT_NAVIGATION_LAYOUT,
  NAV_BAR_SLOTS,
  resolveNavigation,
  type NavPin,
  type NavPinTarget,
  type NavSection,
  type NavigationLayout,
  type ResolvedNav,
  type ResolvedNode,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { confirm } from '../components/confirm-store';
import { useStableValue } from '../components/use-stable-value';
import { notify } from '../components/toast-store';
import { useSizeClass } from '../design/size-class';
import { PREFS, prefValueOf, savePref, usePref, type PrefRead } from '../store/prefs';
import { availabilityOf, useAvailability, type Availability } from '../store/selectors';
import type { EntityStore } from '../store/entity-store';
import type { StoreState } from '../store/state';
import { useEntityStore, useStoreSelector } from '../store/store-context';
import { appendPin, itemsOf, removeNode, withItems } from './nav-edits';
import { pinLeafOf, type PinLeaf } from './pin-leaves';
import { routeNameOfTab } from './nav-model';
import { navTargetKey, pinExists, targetFactsOf, type TargetFacts } from './nav-targets';
import { TAB_ROUTES } from './routes';

const log = new Logger('app.nav');

export type NavScope = 'all' | 'device';

export interface ActiveLayout {
  readonly scope: NavScope;
  readonly layout: NavigationLayout;
}

export function activeLayoutOf(state: StoreState): ActiveLayout {
  const override = prefValueOf(state, PREFS.navigationDevice).override;
  return override === null
    ? { scope: 'all', layout: prefValueOf(state, PREFS.navigation) }
    : { scope: 'device', layout: override };
}

export function pinsOf(layout: NavigationLayout): readonly NavPin[] {
  return (layout.items ?? []).flatMap((node) => {
    if (node.kind === 'pin') return [node];
    return node.kind === 'folder'
      ? node.items.flatMap((entry) => (entry.kind === 'pin' ? [entry] : []))
      : [];
  });
}

function sectionAvailable(section: NavSection, availability: Availability): boolean {
  return TAB_ROUTES.find((route) => route.tab === section)?.available(availability) ?? false;
}

function sameFacts(
  left: ReadonlyMap<string, TargetFacts>,
  right: ReadonlyMap<string, TargetFacts>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, facts] of left) {
    const other = right.get(key);
    if (
      other?.exists !== facts.exists ||
      other.title !== facts.title ||
      other.icon !== facts.icon ||
      other.count !== facts.count
    ) {
      return false;
    }
  }
  return true;
}

function usePinFacts(pins: readonly NavPin[]): ReadonlyMap<string, TargetFacts> {
  return useStoreSelector(
    (state) =>
      new Map(pins.map((pin) => [navTargetKey(pin.target), targetFactsOf(pin.target, state)])),
    sameFacts,
    [pins],
  );
}

function useStored<T>(read: PrefRead<T>, name: string): T | null {
  const reason = read.status === 'invalid' ? read.reason : null;
  useEffect(() => {
    if (reason !== null) log.error('nav.layout_invalid', new Error(reason), { pref: name });
  }, [reason, name]);
  return read.status === 'ready' ? read.value : null;
}

export interface NavigationState {
  readonly scope: NavScope;
  readonly layout: NavigationLayout;
  readonly resolved: ResolvedNav;
  readonly facts: ReadonlyMap<string, TargetFacts>;
}

export function useNavigation(): NavigationState {
  const availability = useAvailability();
  const synced = useStored(usePref(PREFS.navigation), 'navigation') ?? DEFAULT_NAVIGATION_LAYOUT;
  const device = useStored(usePref(PREFS.navigationDevice), 'navigation-device');
  const override = device?.override ?? null;
  const layout = override ?? synced;
  const pins = useMemo(() => pinsOf(layout), [layout]);
  const facts = usePinFacts(pins);
  const resolved = useMemo(
    () =>
      resolveNavigation(layout, {
        section: (section) => sectionAvailable(section, availability),
        exists: (target) => pinExists(target, facts),
      }),
    [layout, availability, facts],
  );
  useEffect(() => {
    if (resolved.duplicates.length > 0) {
      log.warn('nav.layout_duplicate_section', { sections: resolved.duplicates.join(',') });
    }
  }, [resolved.duplicates]);
  return { scope: override === null ? 'all' : 'device', layout, resolved, facts };
}

function writeLayout(store: EntityStore, scope: NavScope, layout: NavigationLayout): void {
  log.info('nav.layout_saved', { scope });
  if (scope === 'device') savePref(store, PREFS.navigationDevice, { override: layout });
  else savePref(store, PREFS.navigation, layout);
}

export interface NavigationWriter {
  readonly commit: (next: NavigationLayout, message: string) => void;
  readonly switchScope: (scope: NavScope) => void;
  readonly reset: () => void;
}

function resetDevice(store: EntityStore): void {
  savePref(store, PREFS.navigationDevice, { override: null });
}

function commitLayout(store: EntityStore, next: NavigationLayout, message: string): void {
  const { scope, layout } = activeLayoutOf(store.get());
  writeLayout(store, scope, next);
  const undo = (): void => {
    writeLayout(store, scope, layout);
  };
  notify({ message, undo });
}

export function switchNavScope(store: EntityStore, scope: NavScope): void {
  const current = activeLayoutOf(store.get());
  if (current.scope === scope) return;
  if (scope === 'device') {
    writeLayout(store, 'device', current.layout);
    notify({ message: 'This device now has its own navigation' });
    return;
  }
  confirm({
    title: 'Discard this device’s layout?',
    body: 'This device will follow the layout shared by all your devices again.',
    confirmLabel: 'Discard',
    tone: 'destructive',
  })
    .then((accepted) => {
      if (accepted) resetDevice(store);
    })
    .catch((error: unknown) => {
      log.error('nav.scope_switch_failed', error);
    });
}

export function resetNavigation(store: EntityStore): void {
  const { scope, layout } = activeLayoutOf(store.get());
  confirm({
    title: 'Reset navigation?',
    body: 'Your pins, folders and hidden pages go back to the default.',
    confirmLabel: 'Reset',
    tone: 'destructive',
  })
    .then((accepted) => {
      if (!accepted) return;
      if (scope === 'device') resetDevice(store);
      else savePref(store, PREFS.navigation, DEFAULT_NAVIGATION_LAYOUT);
      notify({
        message: 'Navigation reset',
        undo: () => {
          writeLayout(store, scope, layout);
        },
      });
    })
    .catch((error: unknown) => {
      log.error('nav.reset_failed', error);
    });
}

export function useNavigationWriter(): NavigationWriter {
  const store = useEntityStore();
  return {
    commit: (next, message): void => {
      commitLayout(store, next, message);
    },
    switchScope: (scope): void => {
      switchNavScope(store, scope);
    },
    reset: (): void => {
      resetNavigation(store);
    },
  };
}

export function newNavId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 10);
}

export interface NavPins {
  readonly isPinned: (target: NavPinTarget) => boolean;
  readonly pin: (target: NavPinTarget, title?: string) => void;
  readonly unpin: (target: NavPinTarget) => void;
}

function findPin(layout: NavigationLayout, target: NavPinTarget): NavPin | undefined {
  const key = navTargetKey(target);
  return pinsOf(layout).find((pin) => navTargetKey(pin.target) === key);
}

export function landing(layout: NavigationLayout, availability: Availability, nav: string): string {
  if (nav !== 'bar') return 'Pinned to navigation';
  const { barSlots } = resolveNavigation(layout, {
    section: (section) => sectionAvailable(section, availability),
    exists: () => true,
  });
  return barSlots.length < NAV_BAR_SLOTS ? 'Pinned · in the bar' : 'Pinned · in the sheet';
}

function newPin(target: NavPinTarget, title: string | undefined): NavPin {
  return { kind: 'pin', id: newNavId(), target, title: title ?? null, icon: null };
}

export function usePinned(target: NavPinTarget | null): boolean {
  const key = target === null ? null : navTargetKey(target);
  return useStoreSelector(
    (state) =>
      key !== null &&
      pinsOf(activeLayoutOf(state).layout).some((pin) => navTargetKey(pin.target) === key),
    Object.is,
    [key],
  );
}

export function useNavPins(): NavPins {
  const store = useEntityStore();
  const writer = useNavigationWriter();
  const { nav } = useSizeClass();
  return {
    isPinned: (target) => findPin(activeLayoutOf(store.get()).layout, target) !== undefined,
    pin: (target, title): void => {
      const { layout } = activeLayoutOf(store.get());
      if (findPin(layout, target) !== undefined) return;
      const items = appendPin(itemsOf(layout), newPin(target, title));
      writer.commit(withItems(layout, items), landing(layout, availabilityOf(store.get()), nav));
    },
    unpin: (target): void => {
      const { layout } = activeLayoutOf(store.get());
      const found = findPin(layout, target);
      if (found === undefined) return;
      writer.commit(withItems(layout, removeNode(itemsOf(layout), found.id)), 'Unpinned');
    },
  };
}

function sectionsOf(node: ResolvedNode): readonly NavSection[] {
  if (node.kind === 'section') return [node.section];
  if (node.kind === 'pin') return [];
  return node.items.flatMap((entry) => (entry.kind === 'section' ? [entry.section] : []));
}

export function prewarmOrderOf(resolved: ResolvedNav): readonly string[] {
  return [...resolved.nodes.flatMap(sectionsOf).map(routeNameOfTab), routeNameOfTab('settings')];
}

export function useNavOrder(): readonly string[] {
  const { resolved } = useNavigation();
  const joined = prewarmOrderOf(resolved).join('|');
  return useMemo(() => joined.split('|'), [joined]);
}

function pinsOfNode(node: ResolvedNode): readonly NavPin[] {
  if (node.kind === 'pin') return node.missing ? [] : [node.pin];
  if (node.kind === 'section') return [];
  return node.items.flatMap((entry) => (entry.kind === 'pin' && !entry.missing ? [entry.pin] : []));
}

export function pinLeavesOf(resolved: ResolvedNav): readonly PinLeaf[] {
  const leaves = resolved.nodes.flatMap(pinsOfNode).flatMap((pin) => pinLeafOf(pin.target) ?? []);
  return [...new Map(leaves.map((leaf) => [leaf.id, leaf])).values()];
}

function sameLeaves(kept: readonly PinLeaf[], next: readonly PinLeaf[]): boolean {
  return kept.length === next.length && kept.every((leaf, index) => leaf.id === next[index]?.id);
}

export function usePinLeaves(): readonly PinLeaf[] {
  const { resolved } = useNavigation();
  return useStableValue(pinLeavesOf(resolved), sameLeaves);
}
