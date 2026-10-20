import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { Logger } from '@smarteverything/logging';
import { logEnabled } from '../design/log-tally';
import { touchQuietIn } from '../design/touch-activity';

const log = new Logger('app.screens');

const VIEW_COUNT_GAP_MS = 2000;
const HOST_TAGS = new Set([5, 6]);

export interface ScreenNavigation {
  readonly isFocused: () => boolean;
  readonly addListener: (type: 'focus' | 'blur' | 'state', listener: () => void) => () => void;
}

let mounted = 0;
let focusedCount = 0;
let lastViewCount = 0;
let viewTimer: ReturnType<typeof setTimeout> | null = null;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function fiberRoots(): unknown[] {
  const hook: unknown = Reflect.get(globalThis, '__REACT_DEVTOOLS_GLOBAL_HOOK__');
  const renderers: unknown = isRecord(hook) ? hook['renderers'] : null;
  const read: unknown = isRecord(hook) ? hook['getFiberRoots'] : null;
  if (!(renderers instanceof Map) || typeof read !== 'function') return [];
  return [...renderers.keys()].flatMap((id: unknown) => {
    const roots: unknown = Reflect.apply(read, hook, [id]);
    return roots instanceof Set
      ? [...roots].map((root: unknown) => (isRecord(root) ? root['current'] : null))
      : [];
  });
}

function countViews(): { fibers: number; hostViews: number } {
  let fibers = 0;
  let hostViews = 0;
  const stack: unknown[] = fiberRoots();
  while (stack.length > 0) {
    const fiber = stack.pop();
    if (!isRecord(fiber)) continue;
    fibers += 1;
    hostViews += HOST_TAGS.has(Number(fiber['tag'])) ? 1 : 0;
    stack.push(fiber['sibling'], fiber['child']);
  }
  return { fibers, hostViews };
}

function scheduleViewCount(cause: string, label: string): void {
  if (!__DEV__ || viewTimer !== null || !logEnabled('debug')) return;
  viewTimer = setTimeout(() => {
    requestIdleCallback(() => {
      countViewsNow(cause, label);
    });
  }, VIEW_COUNT_GAP_MS);
}

function countViewsNow(cause: string, label: string): void {
  if (touchQuietIn(VIEW_COUNT_GAP_MS) > 0) {
    viewTimer = setTimeout(() => {
      countViewsNow(cause, label);
    }, VIEW_COUNT_GAP_MS);
    return;
  }
  viewTimer = null;
  try {
    const { fibers, hostViews } = countViews();
    log.debug('screen.views_counted', {
      cause,
      label,
      mountedScreens: mounted,
      fibers,
      hostViews,
      hostViewsDelta: hostViews - lastViewCount,
    });
    lastViewCount = hostViews;
    // eslint-disable-next-line local/no-swallowed-errors -- logging code cannot log its own failure
  } catch {
    return;
  }
}

interface ScreenIds {
  readonly label: string;
  readonly routeKey: string;
}

function trackScreen(ids: ScreenIds, navigation: ScreenNavigation): () => void {
  const bornAt = Date.now();
  mounted += 1;
  let focused = navigation.isFocused();
  if (focused) focusedCount += 1;
  log.info('screen.mounted', { ...ids, mountedScreens: mounted, focused });
  scheduleViewCount('mount', ids.label);
  const offFocus = navigation.addListener('focus', () => {
    if (!focused) focusedCount += 1;
    focused = true;
    log.info('screen.focused', { ...ids, mountedScreens: mounted, focusedScreens: focusedCount });
  });
  const offBlur = navigation.addListener('blur', () => {
    if (focused) focusedCount -= 1;
    focused = false;
    log.info('screen.blurred', { ...ids, mountedScreens: mounted, focusedScreens: focusedCount });
  });
  return (): void => {
    offFocus();
    offBlur();
    mounted -= 1;
    if (focused) focusedCount -= 1;
    log.info('screen.unmounted', { ...ids, mountedScreens: mounted, livedMs: Date.now() - bornAt });
    scheduleViewCount('unmount', ids.label);
  };
}

export function ScreenLifecycleLog({
  label,
  routeKey,
  navigation,
}: {
  readonly label: string;
  readonly routeKey: string;
  readonly navigation: ScreenNavigation;
}): ReactNode {
  const current = useEffectEvent(() => navigation);
  useEffect(() => trackScreen({ label, routeKey }, current()), [label, routeKey]);
  return null;
}
