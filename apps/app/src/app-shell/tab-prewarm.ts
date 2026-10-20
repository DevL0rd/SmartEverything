import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Logger } from '@smarteverything/logging';
import { ValueStore } from '../design/external-store';
import { touchQuietIn } from '../design/touch-activity';
import { preloadInstantly } from './instant-open';
import type { PinLeaf } from './pin-leaves';
import {
  nextPinStep,
  readRecentLeaves,
  subscribeRecentLeaves,
  type PinSource,
  type PinStep,
} from './pin-prewarm';
import { remountsOnVisit } from './settings-navigation';
import {
  hostedStacks,
  useRegisteredStacks,
  useStackChanges,
  useStackOfGroup,
  type StackHandle,
} from './stack-handles';

const log = new Logger('app.nav');

const SETTLE_MS = 1500;

export const CHAT_ROUTE = 'assistant/chat/[chatId]';
const CHAT_TAB = '(z-assistant)';

const awake = new ValueStore<ReadonlySet<string>>(new Set());
const chatsPreloaded = new Set<string>();

export function wakeTab(key: string): void {
  awake.update((keys) => (keys.has(key) ? keys : new Set([...keys, key])));
}

export function forgetAwake(key: string | undefined): void {
  if (key === undefined) return;
  awake.update((keys) => {
    if (!keys.has(key)) return keys;
    const next = new Set(keys);
    next.delete(key);
    return next;
  });
}

export function useTabAwake(key: string): boolean {
  return useSyncExternalStore(
    awake.subscribe,
    () => awake.get().has(key),
    () => awake.get().has(key),
  );
}

function useAwakeTabs(): ReadonlySet<string> {
  return useSyncExternalStore(awake.subscribe, awake.get, awake.get);
}

interface TabRoute {
  readonly key: string;
  readonly name: string;
}

export interface PrewarmTabs {
  readonly state: {
    readonly index: number;
    readonly routes: readonly TabRoute[];
    readonly preloadedRouteKeys: readonly string[];
  };
  readonly navigation: {
    readonly preload: (name: string) => void;
  };
}

export type PrewarmStep =
  | { readonly kind: 'tab'; readonly key: string; readonly name: string; readonly mounted: boolean }
  | { readonly kind: 'chat'; readonly stack: StackHandle; readonly chatId: string }
  | PinStep;

function whenQuiet(run: () => void): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const attempt = (): void => {
    requestIdleCallback(() => {
      if (cancelled) return;
      const wait = touchQuietIn(SETTLE_MS);
      if (wait > 0) {
        timer = setTimeout(attempt, wait);
        return;
      }
      run();
    });
  };
  attempt();
  return (): void => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}

function inOrder(
  state: PrewarmTabs['state'],
  order: readonly string[] | undefined,
): readonly TabRoute[] {
  if (order === undefined) return state.routes;
  return order.flatMap((name) => state.routes.filter((route) => route.name === name));
}

export function nextColdTab(
  state: PrewarmTabs['state'],
  isAwake: (key: string) => boolean,
  order?: readonly string[],
): { readonly key: string; readonly name: string; readonly mounted: boolean } | null {
  const focused = state.routes[state.index]?.key;
  const route = inOrder(state, order).find(
    (candidate) =>
      candidate.key !== focused && !isAwake(candidate.key) && !remountsOnVisit(candidate.name),
  );
  return route === undefined
    ? null
    : { name: route.name, key: route.key, mounted: state.preloadedRouteKeys.includes(route.key) };
}

export interface ChatLeafSource {
  readonly chatId: string | null;
  readonly preloaded: ReadonlySet<string>;
  readonly stack: StackHandle | null;
}

export function nextChatLeaf(
  state: PrewarmTabs['state'],
  isAwake: (key: string) => boolean,
  source: ChatLeafSource,
): { readonly stack: StackHandle; readonly chatId: string } | null {
  const { chatId, preloaded, stack } = source;
  const tab = state.routes.find((route) => route.name === CHAT_TAB);
  if (
    chatId === null ||
    stack === null ||
    tab === undefined ||
    state.routes[state.index]?.key === tab.key ||
    !isAwake(tab.key) ||
    stack.routeNames().includes(CHAT_ROUTE) ||
    preloaded.has(`${stack.key}:${chatId}`)
  ) {
    return null;
  }
  return { stack, chatId };
}

function hostsOf(
  state: PrewarmTabs['state'],
  isAwake: (key: string) => boolean,
): ReadonlySet<string> {
  return new Set(
    state.routes.flatMap((route, position) =>
      position === state.index || isAwake(route.key) ? [route.name] : [],
    ),
  );
}

export interface PrewarmSources {
  readonly chat: ChatLeafSource;
  readonly pins: PinSource;
}

export function nextStep(
  state: PrewarmTabs['state'],
  isAwake: (key: string) => boolean,
  sources: PrewarmSources,
  order?: readonly string[],
): PrewarmStep | null {
  const tab = nextColdTab(state, isAwake, order);
  if (tab !== null) return { kind: 'tab', ...tab };
  const leaf = nextChatLeaf(state, isAwake, sources.chat);
  if (leaf !== null) return { kind: 'chat', ...leaf };
  return nextPinStep(hostsOf(state, isAwake), isAwake, sources.pins);
}

interface Running {
  readonly label: string;
  readonly at: number;
  readonly finished: (state: PrewarmTabs['state'], keys: ReadonlySet<string>) => boolean;
}

const running = new ValueStore<Running | null>(null);
let sessionStart: number | null = null;

function whenFree(run: () => void): () => void {
  let cancelQuiet = (): void => undefined;
  let stopWaiting = (): void => undefined;
  const wait = (): void => {
    if (running.get() !== null) {
      stopWaiting = running.subscribe(() => {
        if (running.get() === null) {
          stopWaiting();
          wait();
        }
      });
      return;
    }
    cancelQuiet = whenQuiet(() => {
      if (running.get() !== null) {
        wait();
        return;
      }
      run();
    });
  };
  wait();
  return (): void => {
    cancelQuiet();
    stopWaiting();
  };
}

function stageDone(state: PrewarmTabs['state'], keys: ReadonlySet<string>): void {
  const current = running.get();
  if (current === null) return;
  if (!current.finished(state, keys)) return;
  log.debug('tab.prewarm_stage_done', () => ({
    stage: current.label,
    durationMs: Math.round(performance.now() - current.at),
  }));
  running.set(null);
}

function begin(label: string, finished: Running['finished']): void {
  const at = performance.now();
  sessionStart ??= at;
  running.set({ label, at, finished });
  log.debug('tab.prewarm_stage_started', { stage: label });
}

function runPin(step: PinStep): void {
  if (step.kind === 'wake') {
    begin(`wake ${step.label}`, () => true);
    wakeTab(step.routeKey);
    return;
  }
  if (step.kind === 'drop') {
    begin(`drop ${step.label}`, () => true);
    forgetAwake(step.routeKey);
    step.stack.drop(step.routeKey);
    return;
  }
  begin(`pin ${step.leaf.id}`, () => true);
  preloadInstantly({ name: step.leaf.route, params: step.leaf.params }, () => {
    step.stack.preload(step.leaf.route, step.leaf.params);
  });
}

function run(step: PrewarmStep, navigation: PrewarmTabs['navigation']): void {
  if (step.kind === 'wake' || step.kind === 'drop' || step.kind === 'pin') {
    runPin(step);
    return;
  }
  if (step.kind === 'chat') {
    chatsPreloaded.add(`${step.stack.key}:${step.chatId}`);
    begin(`chat ${step.chatId}`, () => true);
    preloadInstantly({ name: CHAT_ROUTE, params: { chatId: step.chatId } }, () => {
      step.stack.preload(CHAT_ROUTE, { chatId: step.chatId });
    });
    return;
  }
  if (step.mounted) {
    begin(`wake ${step.name}`, (_, keys) => keys.has(step.key));
    wakeTab(step.key);
    return;
  }
  begin(`mount ${step.name}`, (state) => state.preloadedRouteKeys.includes(step.key));
  navigation.preload(step.name);
}

function withHosts(order: readonly string[], leaves: readonly PinLeaf[]): readonly string[] {
  const missing = leaves.map((leaf) => leaf.group).filter((group) => !order.includes(group));
  return missing.length === 0 ? order : [...order, ...new Set(missing)];
}

function usePinSource(leaves: readonly PinLeaf[]): PinSource {
  const recent = useSyncExternalStore(subscribeRecentLeaves, readRecentLeaves, readRecentLeaves);
  const registered = useRegisteredStacks();
  const stacks = useMemo(() => hostedStacks(registered), [registered]);
  return useMemo(() => ({ leaves, recent, stacks }), [leaves, recent, stacks]);
}

export function useTabPrewarm({
  state,
  navigation,
  chatOf,
  order,
  pins,
}: PrewarmTabs & {
  readonly chatOf: () => string | null;
  readonly order: readonly string[];
  readonly pins: readonly PinLeaf[];
}): void {
  const keys = useAwakeTabs();
  const stack = useStackOfGroup(CHAT_TAB);
  const pinSource = usePinSource(pins);
  const stackChanges = useStackChanges();
  const hostOrder = useMemo(() => withHosts(order, pins), [order, pins]);
  useEffect(() => {
    stageDone(state, keys);
    const chatId = chatOf();
    const step = nextStep(
      state,
      (key) => keys.has(key),
      { chat: { chatId, preloaded: chatsPreloaded, stack }, pins: pinSource },
      hostOrder,
    );
    if (step === null) {
      if (sessionStart !== null && running.get() === null) {
        const startedAt = sessionStart;
        log.debug('tab.prewarm_complete', () => ({
          totalMs: Math.round(performance.now() - startedAt),
          chatKnown: chatId !== null,
          stackKnown: stack !== null,
        }));
        sessionStart = null;
      }
      return undefined;
    }
    return whenFree(() => {
      run(step, navigation);
    });
  }, [state, navigation, keys, chatOf, stack, hostOrder, pinSource, stackChanges]);
}

function useAwakeAmong(routeKeys: readonly string[]): ReadonlySet<string> {
  const joined = useSyncExternalStore(
    awake.subscribe,
    () => routeKeys.filter((key) => awake.get().has(key)).join('|'),
    () => '',
  );
  return useMemo(() => new Set(joined === '' ? [] : joined.split('|')), [joined]);
}

export function useSectionPrewarm({ state, navigation }: PrewarmTabs): void {
  const keys = useAwakeAmong(state.routes.map((route) => route.key));
  useEffect(() => {
    stageDone(state, keys);
    const section = nextColdTab(state, (key) => keys.has(key));
    if (section === null) return undefined;
    return whenFree(() => {
      log.debug('section.prewarm_stage', {
        stage: section.mounted ? 'wake' : 'mount',
        section: section.name,
      });
      if (section.mounted) {
        begin(`wake section ${section.name}`, (_, awakeKeys) => awakeKeys.has(section.key));
        wakeTab(section.key);
      } else {
        begin(`mount section ${section.name}`, (current) =>
          current.preloadedRouteKeys.includes(section.key),
        );
        navigation.preload(section.name);
      }
    });
  }, [state, navigation, keys]);
}
