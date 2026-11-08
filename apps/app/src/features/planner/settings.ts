import type { SettingDefinition } from '../../settings/types';
import { CALENDAR, CLOCK, WATCH_AND_AI } from './settings/page-clock';
import { DAY_PLANNER, GENERAL, TASKS } from './settings/page-day';
import { PLANNER_SUBPAGE_SETTINGS } from './settings/subpages';

export { PLANNER_CLOCK_SETTING, PLANNER_SETTINGS_PAGE } from './settings/define';

export const SETTINGS: readonly SettingDefinition[] = [
  ...GENERAL,
  ...DAY_PLANNER,
  ...TASKS,
  ...CALENDAR,
  ...CLOCK,
  ...WATCH_AND_AI,
  ...PLANNER_SUBPAGE_SETTINGS,
];
