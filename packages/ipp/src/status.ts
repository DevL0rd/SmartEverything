import { z } from 'zod';
import { readAlerts, type Alert } from './alerts';
import { IppReadError } from './errors';
import { PRINTER_STATE } from './ops';
import type { PlainObject } from './plain';
import { maybeSet, orNull, present, readSource, textOrNull, type DropReporter } from './schema-kit';
import { readSupplies, type Supply } from './supply';
import { readTrays, type Tray } from './trays';

export type PrinterStateName = 'idle' | 'processing' | 'stopped';

export interface Counters {
  readonly pages: number | null;
  readonly impressions: number | null;
  readonly sheets: number | null;
  readonly color: number | null;
  readonly mono: number | null;
}

export interface PrinterStatus {
  readonly state: PrinterStateName;
  readonly reasons: readonly string[];
  readonly message: string | null;
  readonly accepting: boolean | null;
  readonly queuedJobs: number | null;
  readonly upTime: number | null;
  readonly stateChangeTime: number | null;
  readonly configChangeTime: number | null;
  readonly markerChangeTime: number | null;
  readonly currentTime: string | null;
  readonly supplies: readonly Supply[];
  readonly alerts: readonly Alert[];
  readonly inputTrays: readonly Tray[];
  readonly outputTrays: readonly Tray[];
  readonly mediaReady: readonly string[];
  readonly counters: Counters;
  readonly operatorMessage: string | null;
  readonly detailedMessages: readonly string[];
}

export const MINIMAL_ATTRIBUTES: readonly string[] = [
  'printer-state',
  'printer-state-reasons',
  'printer-state-message',
  'printer-is-accepting-jobs',
  'queued-job-count',
  'printer-up-time',
  'printer-current-time',
  'printer-state-change-time',
  'printer-config-change-time',
  'marker-names',
  'marker-types',
  'marker-levels',
  'marker-colors',
  'marker-low-levels',
  'marker-high-levels',
  'marker-change-time',
  'printer-supply',
  'printer-supply-description',
  'printer-alert',
  'printer-alert-description',
  'media-ready',
  'printer-input-tray',
  'printer-output-tray',
  'printer-pages-completed',
  'printer-impressions-completed',
  'printer-media-sheets-completed',
  'printer-impressions-completed-col',
  'printer-message-from-operator',
  'printer-detailed-status-messages',
];

const STATE_NAMES: ReadonlyMap<number, PrinterStateName> = new Map([
  [PRINTER_STATE.idle, 'idle'],
  [PRINTER_STATE.processing, 'processing'],
  [PRINTER_STATE.stopped, 'stopped'],
]);

const IMPRESSIONS_COL = z.object({
  monochrome: orNull(z.number()),
  'full-color': orNull(z.number()),
});

const STATUS_SOURCE = z.object({
  'printer-state': z.number(),
  'printer-state-reasons': maybeSet(z.string()),
  'printer-state-message': textOrNull(),
  'printer-is-accepting-jobs': orNull(z.boolean()),
  'queued-job-count': orNull(z.number()),
  'printer-up-time': orNull(z.number()),
  'printer-current-time': orNull(z.string()),
  'printer-state-change-time': orNull(z.number()),
  'printer-config-change-time': orNull(z.number()),
  'marker-change-time': orNull(z.number()),
  'media-ready': maybeSet(z.string()),
  'printer-pages-completed': orNull(z.number()),
  'printer-impressions-completed': orNull(z.number()),
  'printer-media-sheets-completed': orNull(z.number()),
  'printer-impressions-completed-col': orNull(IMPRESSIONS_COL),
  'printer-message-from-operator': textOrNull(),
  'printer-detailed-status-messages': maybeSet(z.string()),
});

function stateOf(code: number): PrinterStateName {
  const state = STATE_NAMES.get(code);
  if (state === undefined) {
    throw new IppReadError(
      'printer-state',
      'idle (3), processing (4) or stopped (5)',
      String(code),
    );
  }
  return state;
}

export function readStatus(plain: PlainObject, report?: DropReporter): PrinterStatus {
  const clean = present(plain);
  const source = readSource(STATUS_SOURCE, clean, report);
  const trays = readTrays(clean, report);
  const col = source['printer-impressions-completed-col'];
  return {
    state: stateOf(source['printer-state']),
    reasons: source['printer-state-reasons'].filter((reason) => reason !== 'none'),
    message: source['printer-state-message'],
    accepting: source['printer-is-accepting-jobs'],
    queuedJobs: source['queued-job-count'],
    upTime: source['printer-up-time'],
    stateChangeTime: source['printer-state-change-time'],
    configChangeTime: source['printer-config-change-time'],
    markerChangeTime: source['marker-change-time'],
    currentTime: source['printer-current-time'],
    supplies: readSupplies(clean, report),
    alerts: readAlerts(clean, report),
    inputTrays: trays.input,
    outputTrays: trays.output,
    mediaReady: source['media-ready'],
    counters: {
      pages: source['printer-pages-completed'],
      impressions: source['printer-impressions-completed'],
      sheets: source['printer-media-sheets-completed'],
      color: col?.['full-color'] ?? null,
      mono: col?.monochrome ?? null,
    },
    operatorMessage: source['printer-message-from-operator'],
    detailedMessages: source['printer-detailed-status-messages'].filter((line) => line !== ''),
  };
}
