import type { SettingDefinition } from '../../settings/types';
import { ROUTES } from './routes';

const LINKED: ReadonlySet<string> = new Set([
  'automations.values',
  'automations.sequences',
  'automations.scheduled',
  'automations.schedule',
  'automations.runs',
]);

export const SETTINGS: readonly SettingDefinition[] = ROUTES.filter((route) =>
  LINKED.has(route.key),
).map((route): SettingDefinition => ({
  id: route.key,
  page: 'automations',
  title: route.title,
  icon: route.icon,
  keywords: route.keywords,
  scope: 'server',
  control: 'link',
  href: route.href,
}));
