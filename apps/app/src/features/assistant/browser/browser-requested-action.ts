import { useEffect, useEffectEvent } from 'react';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useBrowserActionScope } from './browser-action-scope';
import type { BrowserAction } from './browser-actions';
export function useRequestedBrowserAction(
  handlers: Readonly<Partial<Record<BrowserAction, () => void>>>,
): void {
  const focused = useIsFocused();
  const active = useBrowserActionScope();
  const { browserAction } = useLocalSearchParams<{ browserAction?: string }>();
  const run = useEffectEvent((): void => {
    const handler = Object.entries(handlers).find(([id]) => id === browserAction)?.[1];
    if (handler === undefined) return;
    router.setParams({ browserAction: undefined });
    handler();
  });
  useEffect(() => {
    if (active && focused && browserAction !== undefined) run();
  }, [active, focused, browserAction]);
}
