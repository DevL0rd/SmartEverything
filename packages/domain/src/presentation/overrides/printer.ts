import { PRINTER_KEYS } from '../../printer';
import type {
  CapabilityMatch,
  CapabilityOverride,
  ModelOverride,
  UnlistedOverride,
} from '../types';

const WORDS = ['printer', 'print', 'paper', 'ink', 'toner', 'cartridge'] as const;

const READING: UnlistedOverride = {
  tier: 'reading',
  groupLabel: 'Printer',
  readOnly: true,
  keywords: [...WORDS, 'tray', 'low ink', 'supply'],
};

function reading(label: string, extra: Partial<CapabilityOverride> = {}): CapabilityOverride {
  return { ...READING, label, ...extra };
}

const PRINTER: ModelOverride = {
  family: 'printer',
  unlisted: READING,
  capabilities: {
    [PRINTER_KEYS.state]: reading('Printer state', {
      tier: 'primary',
      groupLabel: 'Status',
      options: { idle: 'Idle', printing: 'Printing', stopped: 'Stopped' },
    }),
    [PRINTER_KEYS.queue]: {
      label: 'Print queue',
      tier: 'control',
      groupLabel: 'Status',
      keywords: [...WORDS, 'pause', 'resume', 'queue'],
      options: { running: 'Running', paused: 'Paused' },
    },
    [PRINTER_KEYS.accepting]: reading('Accepting jobs', { groupLabel: 'Status' }),
    [PRINTER_KEYS.queuedJobs]: reading('Queued jobs', { groupLabel: 'Status', unit: 'jobs' }),
    [PRINTER_KEYS.problem]: reading('Problem', { groupLabel: 'Status' }),
    [PRINTER_KEYS.attention]: reading('Needs attention', { groupLabel: 'Status' }),
    [PRINTER_KEYS.powerState]: reading('Power state', {
      groupLabel: 'Status',
      options: { awake: 'Awake', standby: 'Standby', hibernate: 'Hibernating', off: 'Off' },
    }),
    [PRINTER_KEYS.jobProgress]: reading('Job progress', { groupLabel: 'Job', unit: '%' }),
    [PRINTER_KEYS.pagesTotal]: reading('Pages printed', { groupLabel: 'Pages', unit: 'pages' }),
    [PRINTER_KEYS.pagesColor]: reading('Colour pages', { groupLabel: 'Pages', unit: 'pages' }),
    [PRINTER_KEYS.pagesMono]: reading('Mono pages', { groupLabel: 'Pages', unit: 'pages' }),
    [PRINTER_KEYS.pagesToday]: reading('Pages today', { groupLabel: 'Pages', unit: 'pages' }),
    [PRINTER_KEYS.pagesWeek]: reading('Pages this week', { groupLabel: 'Pages', unit: 'pages' }),
    [PRINTER_KEYS.daysLeft]: reading('Days of ink left', { groupLabel: 'Supplies', unit: 'days' }),
    [PRINTER_KEYS.costMonth]: reading('Spend this month', { groupLabel: 'Pages' }),
    [PRINTER_KEYS.testPage]: {
      label: 'Print a test page',
      tier: 'control',
      groupLabel: 'Actions',
      keywords: [...WORDS, 'test page', 'test print'],
    },
    [PRINTER_KEYS.identify]: {
      label: 'Find the printer',
      tier: 'control',
      groupLabel: 'Actions',
      keywords: [...WORDS, 'identify', 'beep', 'flash', 'where'],
    },
  },
};

export const PRINTER_MATCH: CapabilityMatch = {
  kind: 'printer',
  requires: [PRINTER_KEYS.state],
  override: PRINTER,
};
