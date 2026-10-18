import { createContext, use, type ReactNode } from 'react';
import { CUSTOM_SETTINGS_SCREENS } from './custom-screens';
import { useSitemap, type SitemapType } from 'expo-router';
import { hasSettingsOn } from './registry';
import { childrenOf, onPlatform } from './tree';
import type { SettingEnv, SettingsPageDefinition } from './types';

function routeOf(contextKey: string): string {
  return contextKey
    .replace(/^\.\//, '')
    .replace(/\([^)]*\)\//g, '')
    .replace(/\.[jt]sx?$/, '')
    .replace(/(^|\/)index$/, '');
}

function settingsIdOfRoute(route: string): string | null {
  if (route === 'settings') {
    return 'home';
  }
  return route.startsWith('settings/') ? route.slice('settings/'.length) : null;
}

function collect(node: SitemapType, into: Set<string>): void {
  const id = settingsIdOfRoute(routeOf(node.contextKey));
  if (id !== null && !id.includes('[') && !id.endsWith('_layout')) {
    into.add(id);
  }
  for (const child of node.children) {
    collect(child, into);
  }
}

const BuiltPagesContext = createContext<ReadonlySet<string> | null>(null);

class NoBuiltPagesError extends Error {
  override readonly name = 'NoBuiltPagesError';

  constructor() {
    super('The settings pages are read outside the settings layout that lists the built routes.');
  }
}

export function BuiltSettingsPages({ children }: { readonly children: ReactNode }): ReactNode {
  const sitemap = useSitemap();
  const built = new Set<string>(Object.keys(CUSTOM_SETTINGS_SCREENS));
  if (sitemap !== null) {
    collect(sitemap, built);
  }
  return <BuiltPagesContext value={built}>{children}</BuiltPagesContext>;
}

export function useBuiltSettingsPages(): ReadonlySet<string> {
  const built = use(BuiltPagesContext);
  if (built === null) {
    throw new NoBuiltPagesError();
  }
  return built;
}

export interface PageAvailability {
  readonly env: SettingEnv;
  readonly built: ReadonlySet<string>;
}

export function pageAvailable(
  page: SettingsPageDefinition,
  availability: PageAvailability,
): boolean {
  if (!(page.visible?.(availability.env) ?? true) || !onPlatform(page, availability.env)) {
    return false;
  }
  if (
    page.href !== undefined ||
    availability.built.has(page.id) ||
    hasSettingsOn(page.id, availability.env)
  ) {
    return true;
  }
  return childrenOf(page.id).some((child) => pageAvailable(child, availability));
}
