import { CLIENT_PREFS, type AutomationsBreakpointsPref } from '@smarteverything/domain';
import { prefValueOf, savePref } from '../../store/prefs';
import type { StoreState } from '../../store/state';
import type { SettingContext, SettingDefinition, SettingEnv } from '../../settings/types';
import { ROUTES } from './routes';

const PAGE = 'automations';
const SECTION = 'Editor';

const LINKED: ReadonlySet<string> = new Set([
  'automations.nodes',
  'automations.templates',
  'automations.variables',
  'automations.scheduled',
  'automations.schedule',
  'automations.runs',
  'automations.secrets',
]);

const ownerOnly = (env: SettingEnv): boolean => env.owner;

const VISIBLE: Readonly<Record<string, (env: SettingEnv) => boolean>> = {
  'automations.secrets': ownerOnly,
};

const LINKS: readonly SettingDefinition[] = ROUTES.filter((route) => LINKED.has(route.key)).map(
  (route): SettingDefinition => {
    const visible = VISIBLE[route.key];
    return {
      id: route.key,
      page: PAGE,
      title: route.title,
      icon: route.icon,
      keywords: route.keywords,
      scope: 'server',
      control: 'link',
      href: route.href,
      ...(visible === undefined ? {} : { visible }),
    };
  },
);

const breakpointsOf = (state: StoreState): AutomationsBreakpointsPref =>
  prefValueOf(state, CLIENT_PREFS.automations_breakpoints);

const PREFERENCES: readonly SettingDefinition[] = [
  {
    id: 'automations.clear_breakpoints',
    page: PAGE,
    section: SECTION,
    title: 'Clear all breakpoints',
    description: 'Removes every pause point you set for test runs, in every automation.',
    icon: 'pause',
    keywords: ['breakpoint', 'breakpoints', 'pause', 'debug', 'test', 'dry run', 'clear', 'reset'],
    scope: 'client',
    control: 'action',
    destructive: true,
    when: (state) => Object.keys(breakpointsOf(state).byAutomation).length > 0,
    run: (context: SettingContext): Promise<void> => {
      savePref(context.store, CLIENT_PREFS.automations_breakpoints, { byAutomation: {} });
      return Promise.resolve();
    },
  },
];

export const SETTINGS: readonly SettingDefinition[] = [...LINKS, ...PREFERENCES];
