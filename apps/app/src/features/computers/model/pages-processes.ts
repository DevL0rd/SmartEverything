import type { DevicePageContribution } from '../../../app-shell/device-pages';

export const PROCESSES_PAGES: readonly DevicePageContribution[] = [
  {
    id: 'processes',
    title: 'Processes',
    subtitle: 'Programs running now, with live processor, memory and graphics use',
    icon: 'activity',
    keywords: [
      'processes',
      'programs',
      'running',
      'task manager',
      'end',
      'stop',
      'kill',
      'pause',
      'priority',
      'cpu',
      'memory',
    ],
    settings: [
      'Sort by',
      'Tree',
      'List',
      'Using GPU',
      'Busy disk',
      'End',
      'Force quit',
      'Pause',
      'Resume',
      'Lower priority',
    ],
  },
];
