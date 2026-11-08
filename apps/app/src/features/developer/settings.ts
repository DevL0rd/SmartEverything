import { createElement } from 'react';
import type { SettingDefinition, SettingEnv } from '../../settings/types';
import { DEVELOPER_TOGGLES, type DeveloperToggle } from '../../developer/toggles';
import {
  DeveloperModeRow,
  LogLevelRow,
  ProfilingHeader,
  ProfilingOption,
  ReloadRow,
  WatchCaptureToggleRow,
} from './components/developer-rows';
import { WatchCaptureClearRow } from './components/watch-capture-rows';
import { ShipLevelRow } from './components/ship-level-rows';
import { AiRepairInbox } from './components/ai-repair-inbox';
import { AI_REPAIR_DESCRIPTION, AI_REPAIR_TITLE, AiRepairRow } from './components/ai-repair-row';

export const DEVELOPER_SECTIONS = {
  diagnostics: 'Device diagnostics',
  repair: 'AI repair',
  investigations: 'Error investigations',
  logs: 'Logs',
  profiling: 'Profiling',
  sampling: 'Performance sampling',
  probes: 'Additional probes',
  watch: 'Watch captures',
  actions: 'App actions',
} as const;

function developerToolsShown(env: SettingEnv): boolean {
  return env.owner && env.developer;
}

function watchToolsShown(env: SettingEnv): boolean {
  return developerToolsShown(env) && env.platform === 'android';
}

function sectionOf(toggle: DeveloperToggle): string {
  if (toggle.section === 'Watch') return DEVELOPER_SECTIONS.watch;
  if (toggle.id === 'perf.sampling' || toggle.parent !== null) return DEVELOPER_SECTIONS.sampling;
  return DEVELOPER_SECTIONS.probes;
}

const TOGGLE_SETTINGS: readonly SettingDefinition[] = DEVELOPER_TOGGLES.map((toggle) => ({
  id: `developer.${toggle.id}`,
  page: 'developer',
  section: sectionOf(toggle),
  title: toggle.label,
  description: toggle.description,
  keywords: ['developer', 'debug', ...toggle.keywords],
  scope: 'device',
  control: 'custom',
  row: true,
  visible: toggle.section === 'Watch' ? watchToolsShown : developerToolsShown,
  render: () =>
    toggle.section === 'Watch'
      ? createElement(WatchCaptureToggleRow)
      : createElement(ProfilingOption, { id: toggle.id }),
}));

export const DEVELOPER_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'developer.mode',
    page: 'developer',
    section: DEVELOPER_SECTIONS.diagnostics,
    title: 'Developer mode',
    description: 'Shows diagnostic tools on this device. Warnings and errors still go to the hub.',
    keywords: ['developer', 'mode', 'master', 'unlock', 'release', 'debug'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: (env) => env.owner,
    render: () => createElement(DeveloperModeRow),
  },
  {
    id: 'developer.ai-repair',
    page: 'developer',
    section: DEVELOPER_SECTIONS.repair,
    title: AI_REPAIR_TITLE,
    description: AI_REPAIR_DESCRIPTION,
    keywords: ['ai', 'repair', 'fix', 'automatic', 'errors', 'logs'],
    scope: 'server',
    control: 'custom',
    row: true,
    visible: (env) => env.owner,
    render: () => createElement(AiRepairRow),
  },
  {
    id: 'developer.error-investigations',
    page: 'developer',
    section: DEVELOPER_SECTIONS.investigations,
    title: DEVELOPER_SECTIONS.investigations,
    keywords: ['diagnose', 'ai', 'repair', 'errors', 'logs'],
    scope: 'server',
    control: 'custom',
    visible: (env) => env.owner,
    render: () => createElement(AiRepairInbox),
  },
  {
    id: 'developer.error-investigations.clear-inactive',
    page: 'developer',
    title: 'Clear inactive',
    description: 'Clears inactive error groups from the inbox.',
    keywords: ['clear errors', 'dismiss inactive', 'error investigations', 'repair inbox'],
    scope: 'server',
    control: 'listed',
    in: 'developer.error-investigations',
    visible: (env) => env.owner,
  },
  {
    id: 'developer.error-investigations.dismiss-group',
    page: 'developer',
    title: 'Dismiss error group',
    description: 'Dismisses one group from the error inbox.',
    keywords: ['dismiss error', 'clear error', 'error investigations', 'repair inbox'],
    scope: 'server',
    control: 'listed',
    in: 'developer.error-investigations',
    visible: (env) => env.owner,
  },
  {
    id: 'developer.log-level',
    page: 'developer',
    section: DEVELOPER_SECTIONS.logs,
    title: 'Device log detail',
    scope: 'device',
    control: 'custom',
    row: true,
    visible: developerToolsShown,
    keywords: [
      'developer',
      'log',
      'logging',
      'level',
      'info',
      'debug',
      'trace',
      'verbose',
      'console',
    ],
    render: () => createElement(LogLevelRow),
  },
  {
    id: 'developer.log-sharing',
    page: 'developer',
    section: DEVELOPER_SECTIONS.logs,
    title: 'Hub log detail',
    keywords: ['logs', 'upload', 'ship', 'send', 'warnings', 'errors', 'debug', 'trace'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: developerToolsShown,
    render: () => createElement(ShipLevelRow),
  },
  {
    id: 'developer.profiling.all',
    page: 'developer',
    section: DEVELOPER_SECTIONS.profiling,
    title: 'Select all profiling options',
    description: 'Turns every performance option on or off at once.',
    keywords: ['developer', 'debug', 'profiling', 'performance', 'enable all', 'master'],
    scope: 'device',
    control: 'custom',
    visible: developerToolsShown,
    render: () => createElement(ProfilingHeader),
  },
  ...TOGGLE_SETTINGS,
  {
    id: 'developer.watch-captures.clear',
    page: 'developer',
    section: DEVELOPER_SECTIONS.watch,
    title: 'Clear saved watch files',
    description: 'Deletes the raw watch files saved on the hub.',
    keywords: ['developer', 'debug', 'watch', 'raw', 'capture', 'files', 'clear', 'size'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: watchToolsShown,
    render: () => createElement(WatchCaptureClearRow),
  },
  {
    id: 'developer.reload',
    page: 'developer',
    section: DEVELOPER_SECTIONS.actions,
    title: 'Reload app',
    keywords: ['reload', 'restart', 'refresh', 'developer', 'debug'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: developerToolsShown,
    render: () => createElement(ReloadRow),
  },
];

export const SETTINGS: readonly SettingDefinition[] = DEVELOPER_SETTINGS;
