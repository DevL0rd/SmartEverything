import type { PluginSearchEntry } from '@smarteverything/domain';
import type { PrinterSession } from './session';

const SECTIONS: readonly (readonly [string, string, string, readonly string[]])[] = [
  [
    'supplies',
    'Supplies',
    'supplies',
    ['ink', 'toner', 'cartridge', 'low ink', 'days left', 'waste tank'],
  ],
  ['queue', 'Print queue', 'overview', ['jobs', 'queue', 'cancel job', 'printing']],
  ['history', 'Print history', 'jobs', ['jobs', 'past prints', 'printed documents']],
  [
    'stats',
    'Print statistics',
    'stats',
    ['pages', 'heatmap', 'streak', 'weekly', 'monthly', 'cost'],
  ],
  ['print', 'Print a file', 'print', ['print', 'pdf', 'photo', 'document']],
  [
    'test-page',
    'Print test page',
    'print',
    ['test page', 'alignment', 'nozzle check', 'check printer'],
  ],
  ['paper', 'Paper and trays', 'paper', ['paper', 'tray', 'media', 'output bin']],
  [
    'settings',
    'Printer settings',
    'settings',
    ['thresholds', 'prices', 'goals', 'notifications', 'defaults', 'budget'],
  ],
];

export function searchEntries(sessions: readonly PrinterSession[]): readonly PluginSearchEntry[] {
  return sessions.flatMap((session) =>
    SECTIONS.map(([id, title, section, keywords]) => ({
      id: `${session.record.uuid}.${id}`,
      title: `${session.name} · ${title}`,
      subtitle: null,
      keywords: ['printer', ...keywords],
      target: { kind: 'device' as const, externalId: session.externalId, section, query: {} },
    })),
  );
}
