import {
  PRINTER_IDENTIFY_HOW,
  PRINTER_PRINT_OPTIONS,
  PrinterError,
  STATS_RANGES,
  previousWindowOf,
  windowOf,
  type DayWindow,
  type PrinterStatsView,
  type StatsRange,
} from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { failure, type HubToolResult } from '../../../ai-tools/hub-tool';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { READ_HINTS, WRITE_HINTS, toolResult } from '../tool-kit';
import { dayKeyOf } from './clock';
import type { PrinterRegistry } from './registry';
import type { PrinterService } from './service';
import type { PrinterSession } from './session';
import { requiredModel } from './views';
import { statsView } from './views-stats';

export const PRINTER_ACTION_TOOL = 'printer_action';
export const JOB_TOOL_NAME = 'printer_job';
export const PAUSE_TOOL_NAME = 'printer_pause';
export const STAT_TOOL_NAME = 'printer_stat';

export const JOB_ACTIONS = ['cancel', 'hold', 'release'] as const;
export const STAT_METRICS = ['pages', 'colour_pages', 'cost', 'ink_used'] as const;
export const IDENTIFY_HOWS = PRINTER_IDENTIFY_HOW;

const PRINTER = z.string().min(1);

const PICTURE_SOURCE = z.strictObject({
  kind: z.literal('picture'),
  pictureId: z.string().min(1),
});

const PRINT_CHOICES = PRINTER_PRINT_OPTIONS.pick({ copies: true, sides: true, colorMode: true });

export const PRINT_TOOL = {
  name: PRINTER_ACTION_TOOL,
  input: z.strictObject({
    action: z.literal('print'),
    printer: PRINTER,
    source: PICTURE_SOURCE,
    options: PRINT_CHOICES.optional(),
  }),
};

export const TEST_PAGE_TOOL = {
  name: PRINTER_ACTION_TOOL,
  input: z.strictObject({ action: z.literal('test_page'), printer: PRINTER }),
};

export const IDENTIFY_TOOL = {
  name: PRINTER_ACTION_TOOL,
  input: z.strictObject({
    action: z.literal('identify'),
    printer: PRINTER,
    how: z.enum(IDENTIFY_HOWS).optional(),
  }),
};

const JOB_INPUT = z.strictObject({
  action: z.enum(JOB_ACTIONS),
  job: z.string().min(1),
});

const PAUSE_INPUT = z.strictObject({ printer: PRINTER, paused: z.boolean() });

const STAT_INPUT = z.strictObject({
  printer: PRINTER,
  period: z.enum(STATS_RANGES),
  metric: z.enum(STAT_METRICS),
});

export const JOB_TOOL = { name: JOB_TOOL_NAME, input: JOB_INPUT };
export const PAUSE_TOOL = { name: PAUSE_TOOL_NAME, input: PAUSE_INPUT };
export const STAT_TOOL = { name: STAT_TOOL_NAME, input: STAT_INPUT };

export interface AutomationToolPorts {
  readonly registry: Pick<PrinterRegistry, 'list' | 'resolve'>;
  readonly service: Pick<PrinterService, 'act'>;
  readonly now: () => Date;
}

function refused(cause: unknown): HubToolResult {
  if (cause instanceof PrinterError) {
    return failure(cause.message, { reason: cause.reason, code: cause.reason, ...cause.fields });
  }
  return failure(messageOf(cause));
}

async function attempt(
  work: () => Promise<Readonly<Record<string, unknown>>>,
): Promise<HubToolResult> {
  try {
    return toolResult(await work());
  } catch (cause) {
    return refused(cause);
  }
}

function sessionOfJob(registry: AutomationToolPorts['registry'], job: string): PrinterSession {
  const owners = registry.list().filter((session) => session.ledger.job(job) !== null);
  const [only, ...others] = owners;
  if (only === undefined) {
    throw new PrinterError('not_authorized', `No printer has a print job ${job}.`);
  }
  if (others.length > 0) {
    throw new PrinterError(
      'ambiguous_file',
      `More than one printer has a print job ${job}: ${owners.map((session) => session.name).join(', ')}.`,
    );
  }
  return only;
}

function changeJob(
  ports: AutomationToolPorts,
  input: z.output<typeof JOB_INPUT>,
  caller: Parameters<PrinterService['act']>[1],
): Promise<Readonly<Record<string, unknown>>> {
  const session = sessionOfJob(ports.registry, input.job);
  return ports.service.act(
    { action: input.action, printer: session.record.uuid, job: input.job },
    caller,
  );
}

function pauseOrResume(
  ports: AutomationToolPorts,
  input: z.output<typeof PAUSE_INPUT>,
  caller: Parameters<PrinterService['act']>[1],
): Promise<Readonly<Record<string, unknown>>> {
  const session = ports.registry.resolve(input.printer);
  return ports.service.act(
    { action: input.paused ? 'pause' : 'resume', printer: session.record.uuid },
    caller,
  );
}

function inkUsed(session: PrinterSession, window: DayWindow): number {
  const keys = requiredModel(session)
    .supplies.filter((row) => row.consumed)
    .map((row) => row.key);
  const days = [...session.ledger.supplyDays()].sort(([left], [right]) => (left < right ? -1 : 1));
  let used = 0;
  for (const key of keys) {
    let last: number | null = null;
    for (const [day, record] of days) {
      const point = record[key];
      if (point === undefined) continue;
      if (day > window.to) break;
      if (day >= window.from) used += Math.max(0, (last ?? point.max) - point.close);
      last = point.close;
    }
  }
  return used;
}

function costOf(view: PrinterStatsView, totals: PrinterStatsView['stats']['totals']): number {
  const { cost } = view;
  if (cost === null) {
    throw new PrinterError(
      'not_authorized',
      'No ink or toner prices are set, so there is no cost.',
    );
  }
  const amount = totals.mono * (cost.perMonoPage ?? 0) + totals.color * (cost.perColourPage ?? 0);
  return Math.round(amount * 100) / 100;
}

interface Figure {
  readonly value: number;
  readonly previous: number;
  readonly unit: string;
}

function figureOf(
  session: PrinterSession,
  view: PrinterStatsView,
  input: { readonly metric: (typeof STAT_METRICS)[number]; readonly period: StatsRange },
  today: string,
): Figure {
  const { totals, previous } = view.stats;
  switch (input.metric) {
    case 'pages':
      return { value: totals.pages, previous: previous.pages, unit: view.unit };
    case 'colour_pages':
      return { value: totals.color, previous: previous.color, unit: view.unit };
    case 'cost':
      return {
        value: costOf(view, totals),
        previous: costOf(view, previous),
        unit: view.cost?.currency ?? '',
      };
    case 'ink_used':
      return {
        value: inkUsed(session, windowOf(input.period, today)),
        previous: inkUsed(session, previousWindowOf(input.period, today)),
        unit: '%',
      };
  }
}

function readStat(
  ports: AutomationToolPorts,
  input: z.output<typeof STAT_INPUT>,
  caller: Parameters<PrinterService['act']>[1],
): Readonly<Record<string, unknown>> {
  const session = ports.registry.resolve(input.printer);
  const now = ports.now();
  const today = dayKeyOf(now, session.ledger.zone);
  const view = statsView(session, caller, { period: input.period, anchor: today }, now);
  const figure = figureOf(session, view, input, today);
  return {
    value: figure.value,
    previous: figure.previous,
    change: figure.value - figure.previous,
    unit: figure.unit,
  };
}

export function printerAutomationTools(ports: AutomationToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: JOB_TOOL.name,
      title: 'Cancel, hold or release a print job',
      description:
        'Cancels, holds or releases one print job by its job key. The printer is found from the key.',
      input: JOB_INPUT,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: (input, caller) => attempt(() => changeJob(ports, input, caller)),
    }),
    definePluginTool({
      name: PAUSE_TOOL.name,
      title: 'Pause or resume a printer',
      description: 'Pauses the print queue of one printer, or lets it run again.',
      input: PAUSE_INPUT,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: (input, caller) => attempt(() => pauseOrResume(ports, input, caller)),
    }),
    definePluginTool({
      name: STAT_TOOL.name,
      title: 'Printing figure',
      description:
        'One printing figure for a day, week, month or year against the one before it: pages, colour pages, cost or ink used (percent of a cartridge, summed over colours). Answers value, previous, change and unit.',
      input: STAT_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: (input, caller) => attempt(() => Promise.resolve(readStat(ports, input, caller))),
    }),
  ];
}
