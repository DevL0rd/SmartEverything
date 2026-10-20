import type { z } from 'zod';
import {
  PRINTER_CANDIDATES_VIEW,
  PRINTER_JOBS_VIEW,
  PRINTER_OPTIONS_VIEW,
  PRINTER_OVERVIEW,
  PRINTER_QUEUE_VIEW,
  PRINTER_SETTINGS_VIEW,
  PRINTER_STATS_VIEW,
  PRINTER_SUPPLIES_VIEW,
  PRINTER_TRAYS_VIEW,
  type PrinterActionInput,
  type PrinterReadInput,
} from '@smarteverything/domain';
import { parsePluginReply, readPluginTool } from '../../use-plugin-tool';

export const PRINTER_PLUGIN = 'printer';

interface Schemas {
  readonly overview: typeof PRINTER_OVERVIEW;
  readonly supplies: typeof PRINTER_SUPPLIES_VIEW;
  readonly trays: typeof PRINTER_TRAYS_VIEW;
  readonly queue: typeof PRINTER_QUEUE_VIEW;
  readonly jobs: typeof PRINTER_JOBS_VIEW;
  readonly stats: typeof PRINTER_STATS_VIEW;
  readonly options: typeof PRINTER_OPTIONS_VIEW;
  readonly candidates: typeof PRINTER_CANDIDATES_VIEW;
  readonly settings: typeof PRINTER_SETTINGS_VIEW;
}

export type ViewName = keyof Schemas;

export type ViewOf<K extends ViewName> = z.output<Schemas[K]>;

type Readers = {
  readonly [K in ViewName]: (result: Readonly<Record<string, unknown>>) => ViewOf<K>;
};

function readerOf<T>(schema: z.ZodType<T>): (result: Readonly<Record<string, unknown>>) => T {
  return (result) => parsePluginReply(PRINTER_PLUGIN, 'printer', schema, result);
}

const READERS: Readers = {
  overview: readerOf(PRINTER_OVERVIEW),
  supplies: readerOf(PRINTER_SUPPLIES_VIEW),
  trays: readerOf(PRINTER_TRAYS_VIEW),
  queue: readerOf(PRINTER_QUEUE_VIEW),
  jobs: readerOf(PRINTER_JOBS_VIEW),
  stats: readerOf(PRINTER_STATS_VIEW),
  options: readerOf(PRINTER_OPTIONS_VIEW),
  candidates: readerOf(PRINTER_CANDIDATES_VIEW),
  settings: readerOf(PRINTER_SETTINGS_VIEW),
};

export type ViewQuery = Omit<PrinterReadInput, 'view' | 'printer'>;

export class PrinterCallError extends Error {
  override readonly name = 'PrinterCallError';

  constructor(
    message: string,
    readonly reason: string | null,
  ) {
    super(message);
  }
}

function failureOf(result: Readonly<Record<string, unknown>>): PrinterCallError | null {
  const error = result['error'];
  if (typeof error !== 'string') return null;
  const reason = result['reason'];
  return new PrinterCallError(error, typeof reason === 'string' ? reason : null);
}

export async function readPrinterView<K extends ViewName>(
  printer: string | null,
  view: K,
  query: ViewQuery = {},
): Promise<ViewOf<K>> {
  const result = await readPluginTool(PRINTER_PLUGIN, 'printer', {
    view,
    ...(printer === null ? {} : { printer }),
    ...query,
  });
  const failure = failureOf(result);
  if (failure !== null) throw failure;
  return READERS[view](result);
}

export async function actOnPrinter(
  input: PrinterActionInput,
): Promise<Readonly<Record<string, unknown>>> {
  const result = await readPluginTool(PRINTER_PLUGIN, 'printer_action', input);
  const failure = failureOf(result);
  if (failure !== null) throw failure;
  return result;
}
