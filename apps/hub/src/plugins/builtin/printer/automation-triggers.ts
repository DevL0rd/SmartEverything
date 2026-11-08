import type { PluginTrigger } from '@smarteverything/domain';
import { eventTrigger, ports, type TriggerFilter, type TriggerOutput } from '../automation-kit';
import { JOB, PRINTER } from './automation-entities';
import { JOB_FINISHED, PROBLEM_ADDED, PROBLEM_CLEARED, SUPPLY_EMPTY, SUPPLY_LOW } from './events';

const RESULTS = [
  { id: 'completed', label: 'Printed' },
  { id: 'canceled', label: 'Canceled' },
  { id: 'aborted', label: 'Failed' },
] as const;

const PRINTER_FILTER: TriggerFilter<'printer_id'> = {
  kind: PRINTER.kind,
  title: 'Printer',
  description: 'Only this printer.',
  match: 'printer_id',
};

const PRINTER_OUT: TriggerOutput<'printer_id'> = {
  kind: PRINTER.kind,
  title: 'Printer',
  from: 'printer_id',
};

const PRINTER_NAME_OUT: TriggerOutput<'printer'> = {
  kind: ports.text(),
  title: 'Printer name',
  from: 'printer',
};

const JOB_FINISHED_TRIGGER = eventTrigger({
  id: 'job_finished',
  version: 1,
  title: 'A print job ended',
  description: 'Runs when a print job is printed, canceled or fails.',
  icon: 'circleCheck',
  keywords: ['printer', 'print', 'job', 'finished', 'done', 'printed'],
  summary: 'A print job ended on {printer}',
  event: JOB_FINISHED,
  filters: {
    printer: PRINTER_FILTER,
    result: {
      kind: ports.choice(RESULTS),
      title: 'Result',
      description: 'Only jobs that ended this way.',
      match: 'result',
    },
  },
  outputs: {
    printer: PRINTER_OUT,
    printer_name: PRINTER_NAME_OUT,
    job: { kind: JOB.kind, title: 'Print job', from: 'job' },
    result: { kind: ports.text(), title: 'Result', from: 'result' },
    pages: { kind: ports.number({ integer: true, min: 0 }), title: 'Pages', from: 'pages' },
    person: { kind: ports.text(), title: 'Who printed it', from: 'person' },
  },
});

function supplyTrigger(
  event: typeof SUPPLY_LOW | typeof SUPPLY_EMPTY,
  title: string,
  description: string,
  summary: string,
): PluginTrigger {
  return eventTrigger({
    id: event.kind,
    version: 1,
    title,
    description,
    icon: 'droplet',
    keywords: ['printer', 'ink', 'toner', 'supply', 'cartridge', event.kind],
    summary,
    event,
    filters: { printer: PRINTER_FILTER },
    outputs: {
      printer: PRINTER_OUT,
      printer_name: PRINTER_NAME_OUT,
      supply: { kind: ports.text(), title: 'Supply', from: 'supply' },
      level: {
        kind: ports.number({ min: 0, max: 100, unit: '%' }),
        title: 'Level',
        from: 'level',
      },
    },
  });
}

const SUPPLY_LOW_TRIGGER = supplyTrigger(
  SUPPLY_LOW,
  'Ink or toner is low',
  'Runs when a supply of a printer drops to its low mark.',
  'Supply low on {printer}',
);

const SUPPLY_EMPTY_TRIGGER = supplyTrigger(
  SUPPLY_EMPTY,
  'Ink or toner ran out',
  'Runs when a supply of a printer is empty.',
  'Supply empty on {printer}',
);

const PROBLEM_ADDED_TRIGGER = eventTrigger({
  id: 'problem_added',
  version: 1,
  title: 'A printer problem began',
  description: 'Runs when a printer reports a problem such as a jam, an open cover or no paper.',
  icon: 'warning',
  keywords: ['printer', 'problem', 'jam', 'error', 'paper', 'cover'],
  summary: 'A problem began on {printer}',
  event: PROBLEM_ADDED,
  filters: { printer: PRINTER_FILTER },
  outputs: {
    printer: PRINTER_OUT,
    printer_name: PRINTER_NAME_OUT,
    keyword: { kind: ports.text(), title: 'Problem', from: 'keyword' },
    severity: { kind: ports.text(), title: 'How serious', from: 'severity' },
    part: { kind: ports.text(), title: 'Part', from: 'part' },
  },
});

const PROBLEM_CLEARED_TRIGGER = eventTrigger({
  id: 'problem_cleared',
  version: 1,
  title: 'A printer problem ended',
  description: 'Runs when a problem a printer reported is gone.',
  icon: 'circleCheck',
  keywords: ['printer', 'problem', 'fixed', 'cleared', 'jam'],
  summary: 'A problem ended on {printer}',
  event: PROBLEM_CLEARED,
  filters: { printer: PRINTER_FILTER },
  outputs: {
    printer: PRINTER_OUT,
    printer_name: PRINTER_NAME_OUT,
    keyword: { kind: ports.text(), title: 'Problem', from: 'keyword' },
    part: { kind: ports.text(), title: 'Part', from: 'part' },
  },
});

export const PRINTER_TRIGGERS: readonly PluginTrigger[] = [
  JOB_FINISHED_TRIGGER,
  SUPPLY_LOW_TRIGGER,
  SUPPLY_EMPTY_TRIGGER,
  PROBLEM_ADDED_TRIGGER,
  PROBLEM_CLEARED_TRIGGER,
];
