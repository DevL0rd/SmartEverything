import { type PluginOption, type PluginOptionPage } from '@smarteverything/domain';
import type { PluginContext, PluginOptionProvider, ToolCaller } from '../contract';
import { mayControl } from './access';
import type { PrinterRegistry } from './registry';
import type { JobRecord } from './records';
import type { PrinterSession } from './session';
import { optionPage } from '../automation-kit-pages';

export const PRINTER_PICKER = 'printers';
export const JOB_PICKER = 'jobs';

const DETAIL_MAX = 200;

const OPEN_STATES: ReadonlySet<JobRecord['state']> = new Set([
  'pending',
  'held',
  'processing',
  'stopped',
]);

export interface PickerWorld {
  readonly registry: Pick<PrinterRegistry, 'list'>;
}

function option(id: string, label: string, detail: string | null): PluginOption {
  return {
    id,
    label,
    detail: detail === null ? null : detail.slice(0, DETAIL_MAX),
    color: null,
    image: null,
  };
}

function unavailable(message: string): PluginOptionPage {
  return { state: 'unavailable', message };
}

export function printerOptions(sessions: readonly PrinterSession[]): readonly PluginOption[] {
  return sessions.map((session) =>
    option(session.record.uuid, session.name, session.online ? null : 'Offline'),
  );
}

function jobLabel(record: JobRecord, caller: ToolCaller): string {
  const named = mayControl(record, caller) ? record.name : null;
  return named ?? (record.jobId === null ? 'Print job' : `Print job ${String(record.jobId)}`);
}

export function jobOptions(
  sessions: readonly PrinterSession[],
  caller: ToolCaller,
): readonly PluginOption[] {
  return sessions.flatMap((session) =>
    session.ledger
      .jobs()
      .filter((record) => mayControl(record, caller))
      .sort((left, right) => ((left.createdAt ?? '') < (right.createdAt ?? '') ? 1 : -1))
      .map((record) =>
        option(
          record.key,
          jobLabel(record, caller),
          `${session.name} · ${OPEN_STATES.has(record.state) ? 'waiting or printing' : record.state}`,
        ),
      ),
  );
}

export function printerPicker(world: PickerWorld): PluginOptionProvider {
  return (query) => {
    const sessions = world.registry.list();
    return Promise.resolve(
      sessions.length === 0
        ? unavailable('No printer is set up yet. Add one in the Printers plugin.')
        : optionPage(printerOptions(sessions), query),
    );
  };
}

export function jobPicker(world: PickerWorld): PluginOptionProvider {
  return (query, caller) => {
    const sessions = world.registry.list();
    return Promise.resolve(
      sessions.length === 0
        ? unavailable('No printer is set up yet. Add one in the Printers plugin.')
        : optionPage(jobOptions(sessions, caller), query),
    );
  };
}

export function registerPrinterPickers(
  ctx: Pick<PluginContext<unknown>, 'options'>,
  world: PickerWorld,
): () => void {
  const printers = ctx.options.register(PRINTER_PICKER, printerPicker(world));
  const jobs = ctx.options.register(JOB_PICKER, jobPicker(world));
  return (): void => {
    printers();
    jobs();
  };
}
