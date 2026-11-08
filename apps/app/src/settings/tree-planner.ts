import { googleAccountView, googleRowIn } from '../features/planner/data/google-account';
import type { StoreState } from '../store/state';
import type { SettingsPageDefinition } from './types';

function plannerSummary(state: StoreState): string {
  const google = googleAccountView(googleRowIn(state));
  if (google.needsAttention) return 'Google needs attention';
  return google.linked ? 'Google linked' : 'Google not linked';
}

const subpage = (
  id: string,
  title: string,
  icon: SettingsPageDefinition['icon'],
  keywords: readonly string[],
): SettingsPageDefinition => ({
  id: `planner/${id}`,
  title,
  icon,
  parent: 'planner',
  group: null,
  keywords: ['planner', ...keywords],
});

export const PLANNER_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'planner',
    title: 'Planner settings',
    icon: 'calendar',
    parent: null,
    group: 'App',
    childrenInline: false,
    summary: plannerSummary,
    keywords: [
      'planner',
      'calendar',
      'tasks',
      'reminders',
      'clock',
      'alarms',
      'timers',
      'snooze',
      'world clocks',
      'watch',
      'google',
      'briefing',
    ],
  },
  subpage('day', 'Day runs', 'sun', ['day start', 'day end', 'bedtime']),
  subpage('working-hours', 'Working hours', 'clock', ['work', 'office', 'work days']),
  subpage('smart-lists', 'Smart lists shown', 'list', ['smart lists', 'habits', 'someday']),
  subpage('calendars', 'Calendars', 'calendar', ['calendars', 'visibility', 'hide']),
  subpage('calendar-show', 'Show on the calendar', 'layers', ['overlays', 'sleep', 'free time']),
  subpage('ring-on', 'Ring on', 'smartphone', ['ring', 'phone', 'alarm targets']),
];
