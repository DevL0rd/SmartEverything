import { useEffect } from 'react';
import { usePathname, useRootNavigationState } from 'expo-router';
import { href } from './hrefs';
import { ROUTES } from './routes';
import { SETTINGS_TREE, pageHref } from '../settings/tree';
import {
  backTable,
  createBackOrigins,
  createBackRules,
  leafKeyOf,
  liveKeysOf,
  type BackPage,
} from './back-rules';

function settingsPages(): readonly BackPage[] {
  return SETTINGS_TREE.map((page) => {
    const parent =
      page.parent === null ? undefined : SETTINGS_TREE.find((p) => p.id === page.parent);
    return {
      href: pageHref(page),
      parent: parent === undefined ? href.settings.index() : pageHref(parent),
    };
  });
}

function routePages(): readonly BackPage[] {
  return ROUTES.map((route) => {
    const parent = route.parent === null ? undefined : ROUTES.find((r) => r.key === route.parent);
    return { href: route.href, parent: parent?.href ?? null };
  });
}

const ORIGINS = createBackOrigins();

export const BACK_RULES = createBackRules(
  backTable([...routePages(), ...settingsPages()]),
  ORIGINS,
);

export function useBackOrigins(): void {
  const pathname = usePathname();
  const state = useRootNavigationState();
  const key = leafKeyOf(state);
  useEffect(() => {
    ORIGINS.observe(key, pathname, liveKeysOf(state));
  }, [key, pathname, state]);
}
