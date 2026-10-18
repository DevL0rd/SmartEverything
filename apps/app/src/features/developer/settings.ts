import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { DEVELOPER_TOGGLES } from '../../developer/toggles';
import { WatchWorkoutProbe } from './components/watch-workout-probe';
import { DeveloperToggleRow, ProfilingMasterRow, ReloadRow } from './components/developer-rows';

const TOGGLE_SETTINGS: readonly SettingDefinition[] = DEVELOPER_TOGGLES.map((toggle) => ({
  id: `developer.${toggle.id}`,
  page: 'developer',
  section: toggle.section,
  title: toggle.label,
  description: toggle.description,
  keywords: ['developer', 'debug', ...toggle.keywords],
  scope: 'device',
  control: 'custom',
  row: true,
  ...(toggle.release ? {} : { visible: () => __DEV__ }),
  render: () => createElement(DeveloperToggleRow, { id: toggle.id }),
}));

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'developer.reload',
    page: 'developer',
    section: 'Apply',
    title: 'Reload app',
    keywords: ['reload', 'restart', 'refresh', 'developer', 'debug'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: () => __DEV__,
    render: () => createElement(ReloadRow),
  },
  {
    id: 'developer.profiling.all',
    page: 'developer',
    section: 'Performance',
    title: 'Enable all profiling',
    description: 'Turns every performance option on or off at once.',
    keywords: ['developer', 'debug', 'profiling', 'performance', 'enable all', 'master'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: () => __DEV__,
    render: () => createElement(ProfilingMasterRow),
  },
  {
    id: 'developer.watch-workout-probe',
    page: 'developer',
    section: 'Watch',
    title: 'Workout probe',
    description: 'Starts or finishes a workout of a raw sport code on your watch.',
    keywords: ['developer', 'debug', 'watch', 'workout', 'sport', 'probe'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: (env) => __DEV__ && env.platform === 'android' && env.availability.hasWatch,
    render: () => createElement(WatchWorkoutProbe),
  },
  ...TOGGLE_SETTINGS,
];
