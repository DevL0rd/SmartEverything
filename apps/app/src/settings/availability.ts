import { CUSTOM_SETTINGS_SCREENS } from './custom-screens';
import { useSitemap, type SitemapType } from 'expo-router';
import { settingsIdOfRoute } from './mounts';
import { settingsOn } from './registry';
import { childrenOf, onPlatform } from './tree';
import type { SettingEnv, SettingsPageDefinition } from './types';

function routeOf(contextKey: string): string {
  return contextKey
    .replace(/^\.\//, '')
    .replace(/\([^)]*\)\//g, '')
    .replace(/\.[jt]sx?$/, '')
    .replace(/(^|\/)index$/, '');
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

export function useBuiltSettingsPages(): ReadonlySet<string> {
  const sitemap = useSitemap();
  const built = new Set<string>(Object.keys(CUSTOM_SETTINGS_SCREENS));
  if (sitemap !== null) {
    collect(sitemap, built);
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
    settingsOn(page.id, availability.env).length > 0
  ) {
    return true;
  }
  return childrenOf(page.id).some((child) => pageAvailable(child, availability));
}
