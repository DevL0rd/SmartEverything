import type { Href } from 'expo-router';
import type { RouteDefinition } from '../../app-shell/route-types';
import { breadcrumbOf, settingsPage } from '../../settings/tree';

const PAGES = [
  'home',
  'home/location',
  'home/rooms',
  'members',
  'appearance',
  'notifications',
  'notifications/push-service',
  'about',
  'about/licences',
  'about/privacy',
] as const;

function routeOf(id: (typeof PAGES)[number]): RouteDefinition {
  const page = settingsPage(id);
  if (page === undefined) {
    throw new Error(`The settings page ${id} is missing from the settings tree.`);
  }
  const trail = breadcrumbOf(id);
  const parent = trail.at(-2);
  const path: Href = `/settings/${id}`;
  return {
    key: `settings/${id}`,
    href: path,
    title: page.title,
    icon: page.icon,
    tab: 'settings',
    parent: parent === undefined ? 'settings' : `settings/${parent.id}`,
    keywords: page.keywords,
    available: () => true,
    searchable: false,
  };
}

export const ROUTES: readonly RouteDefinition[] = PAGES.map(routeOf);
