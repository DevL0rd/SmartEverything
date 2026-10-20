import {
  SLOT_COLOURS,
  isPausedByReasons,
  powerStateOf,
  problemsOf,
  slotKeys,
  slotLabel,
  slotOf,
  stateValueOf,
  supplyStandings,
  type PrinterActiveJob,
  type PrinterPowerState,
  type PrinterProblem,
  type PrinterStateValue,
  type PrinterSupplySlot,
  type SupplyForecast,
  type SupplyStatus,
} from '@smarteverything/domain';
import type { PrinterDescription, PrinterStatus, Supply, Tray } from '@smarteverything/ipp';
import type { PrinterRecord } from './records';

export interface SupplyRow extends SupplyStatus {
  readonly name: string;
  readonly colour: string;
  readonly partial: boolean;
  readonly forecast: SupplyForecast | null;
}

export interface TrayRow {
  readonly number: number;
  readonly name: string;
  readonly level: number | null;
  readonly partial: boolean;
  readonly capacity: number | null;
  readonly media: string | null;
  readonly mediaType: string | null;
  readonly ok: boolean;
}

export interface PrinterModel {
  readonly record: PrinterRecord;
  readonly description: PrinterDescription;
  readonly status: PrinterStatus;
  readonly online: boolean;
  readonly secure: boolean;
  readonly state: PrinterStateValue;
  readonly power: PrinterPowerState;
  readonly paused: boolean;
  readonly problems: readonly PrinterProblem[];
  readonly supplies: readonly SupplyRow[];
  readonly trays: readonly TrayRow[];
  readonly bins: readonly TrayRow[];
  readonly pagesToday: number;
  readonly pagesWeek: number;
  readonly jobProgress: number | null;
  readonly activeJob: PrinterActiveJob | null;
  readonly daysLeft: number | null;
  readonly costMonth: number | null;
  readonly gapOpen: boolean;
  readonly observedAt: string;
}

export interface ModelInput {
  readonly record: PrinterRecord;
  readonly description: PrinterDescription;
  readonly status: PrinterStatus;
  readonly online: boolean;
  readonly pagesToday: number;
  readonly pagesWeek: number;
  readonly jobProgress: number | null;
  readonly activeJob: PrinterActiveJob | null;
  readonly forecasts: ReadonlyMap<string, SupplyForecast | null>;
  readonly costMonth: number | null;
  readonly gapOpen: boolean;
  readonly observedAt: string;
}

const VIRTUAL_TRAYS: ReadonlySet<string> = new Set(['auto']);

export function supplySlotsOf(supplies: readonly Supply[]): readonly PrinterSupplySlot[] {
  return supplies.map((supply) => slotOf({ colorant: supply.colorant, kind: supply.kind }));
}

export function supplyKeysOf(
  supplies: readonly Supply[],
  remembered: readonly string[],
): readonly string[] {
  return slotKeys(supplySlotsOf(supplies), remembered);
}

function rowsOf(input: ModelInput): readonly SupplyRow[] {
  const { status, record } = input;
  const slots = supplySlotsOf(status.supplies);
  const keys = slotKeys(slots, record.slotKeys);
  const statuses = supplyStandings(
    status.supplies.map((supply, index) => ({
      key: keys[index] ?? 'other',
      slot: slots[index] ?? 'other',
      kind: supply.kind,
      consumed: supply.consumed,
      level: supply.level,
      lowLevel: supply.lowLevel,
      daysLeft: input.forecasts.get(keys[index] ?? '')?.daysLeft ?? null,
    })),
    status.reasons,
    { thresholds: record.settings.lowThresholds },
  );
  return statuses.map((entry, index) => supplyRow(entry, status.supplies[index], input.forecasts));
}

function supplyRow(
  entry: SupplyStatus,
  supply: Supply | undefined,
  forecasts: ModelInput['forecasts'],
): SupplyRow {
  return {
    ...entry,
    name: supply?.name ?? slotLabel(entry.slot),
    colour: supply?.colour ?? SLOT_COLOURS[entry.slot],
    partial: supply?.partial ?? false,
    forecast: forecasts.get(entry.key) ?? null,
  };
}

function trayRows(trays: readonly Tray[], skipVirtual: boolean): readonly TrayRow[] {
  return trays
    .filter((tray) => !skipVirtual || !VIRTUAL_TRAYS.has(tray.name))
    .map((tray, index) => ({
      number: index + 1,
      name: tray.name,
      level: tray.level,
      partial: tray.partial,
      capacity: tray.capacity,
      media: tray.mediaName,
      mediaType: tray.mediaType,
      ok: tray.ok,
    }));
}

function soonest(rows: readonly SupplyRow[]): number | null {
  const days = rows.flatMap((row) => (row.forecast === null ? [] : [row.forecast.daysLeft]));
  return days.length === 0 ? null : Math.min(...days);
}

export function buildModel(input: ModelInput): PrinterModel {
  const { status, description } = input;
  const state = stateValueOf(status.state);
  const supplies = rowsOf(input);
  return {
    record: input.record,
    description,
    status,
    online: input.online,
    secure: input.record.uri.startsWith('ipps:'),
    state,
    power: powerStateOf(status.reasons),
    paused: isPausedByReasons(status.reasons) || status.accepting === false,
    problems: problemsOf(status.reasons, status.state === 'stopped'),
    supplies,
    trays: trayRows(status.inputTrays, true),
    bins: trayRows(status.outputTrays, false),
    pagesToday: input.pagesToday,
    pagesWeek: input.pagesWeek,
    jobProgress: input.jobProgress,
    activeJob: input.activeJob,
    daysLeft: soonest(supplies),
    costMonth: input.costMonth,
    gapOpen: input.gapOpen,
    observedAt: input.observedAt,
  };
}
