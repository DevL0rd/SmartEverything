import {
  PRINTER_DETAILS,
  PRINTER_KEYS,
  attentionOf,
  printerBinKey,
  printerSummary,
  printerTrayKey,
  problemOf,
  supplyCapabilityKey,
  type AttentionSummary,
  type JsonValue,
  type PrinterDetails,
  type PrinterPowerState,
  type PrinterProblem,
  type PrinterQueueState,
  type PrinterStateValue,
  type PrinterSummary,
  type PrinterSupplyDetail,
  type SupplyStanding,
  type SupplyStatus,
} from '@smarteverything/domain';

export type DeviceReading = { readonly value: JsonValue } | undefined;

export type DeviceReadings = Readonly<Record<string, DeviceReading>>;

export interface SupplyLive {
  readonly detail: PrinterSupplyDetail;
  readonly level: number | null;
  readonly standing: SupplyStanding;
}

export interface TrayLive {
  readonly number: number;
  readonly name: string;
  readonly level: number | null;
  readonly media: string | null;
  readonly capacity: number | null;
}

export interface PrinterLive {
  readonly details: PrinterDetails;
  readonly online: boolean;
  readonly state: PrinterStateValue;
  readonly queue: PrinterQueueState;
  readonly power: PrinterPowerState;
  readonly summary: PrinterSummary;
  readonly attention: AttentionSummary;
  readonly problems: readonly PrinterProblem[];
  readonly supplies: readonly SupplyLive[];
  readonly trays: readonly TrayLive[];
  readonly bins: readonly TrayLive[];
  readonly queued: number;
  readonly pagesToday: number;
  readonly pagesWeek: number;
  readonly jobProgress: number | null;
  readonly daysLeft: number | null;
  readonly lowest: SupplyLive | null;
}

function numberAt(values: DeviceReadings, key: string): number | null {
  const value = values[key]?.value;
  return typeof value === 'number' ? value : null;
}

function textAt<T extends string>(
  values: DeviceReadings,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = values[key]?.value;
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function mediaAt(values: DeviceReadings, number: number): string | null {
  const value = values[`${printerTrayKey(number)}.media`]?.value;
  return typeof value === 'string' && value !== '' ? value : null;
}

function supplyOf(detail: PrinterSupplyDetail, values: DeviceReadings): SupplyLive {
  return {
    detail,
    level: numberAt(values, supplyCapabilityKey(detail.key)),
    standing: detail.standing,
  };
}

function statusOf(supply: SupplyLive): SupplyStatus {
  return {
    key: supply.detail.key,
    slot: supply.detail.slot,
    kind: supply.detail.kind,
    consumed: supply.detail.consumed,
    level: supply.level,
    lowLevel: supply.detail.lowLevel,
    daysLeft: supply.detail.daysLeft,
    standing: supply.standing,
    threshold: supply.detail.threshold,
  };
}

function lowestOf(supplies: readonly SupplyLive[]): SupplyLive | null {
  let best: SupplyLive | null = null;
  for (const supply of supplies) {
    if (!supply.detail.consumed || supply.level === null) continue;
    if (best === null || supply.level < (best.level ?? 100)) best = supply;
  }
  return best;
}

export function parseDetails(details: Readonly<Record<string, unknown>>): PrinterDetails | null {
  const parsed = PRINTER_DETAILS.safeParse(details);
  return parsed.success ? parsed.data : null;
}

function trayOf(tray: PrinterDetails['trays'][number], values: DeviceReadings): TrayLive {
  return {
    number: tray.number,
    name: tray.name,
    level: numberAt(values, printerTrayKey(tray.number)),
    media: mediaAt(values, tray.number),
    capacity: tray.capacity,
  };
}

function binOf(bin: PrinterDetails['bins'][number], values: DeviceReadings): TrayLive {
  return {
    number: bin.number,
    name: bin.name,
    level: numberAt(values, printerBinKey(bin.number)),
    media: null,
    capacity: bin.capacity,
  };
}

export function printerLiveOf(
  details: PrinterDetails,
  values: DeviceReadings,
  online: boolean,
): PrinterLive {
  const state = textAt(values, PRINTER_KEYS.state, ['idle', 'printing', 'stopped'], 'idle');
  const queue = textAt(values, PRINTER_KEYS.queue, ['running', 'paused'], 'running');
  const power = textAt(
    values,
    PRINTER_KEYS.powerState,
    ['awake', 'standby', 'hibernate', 'off'],
    'awake',
  );
  const problems = details.problems.flatMap((problem) => {
    const known = problemOf(problem.keyword, state === 'stopped');
    return known === null ? [] : [known];
  });
  const supplies = details.supplies.map((detail) => supplyOf(detail, values));
  const attention = attentionOf(supplies.map(statusOf), problems);
  const paused = queue === 'paused';
  return {
    details,
    online,
    state,
    queue,
    power,
    summary: printerSummary({ state, power, paused, attention }),
    attention,
    problems,
    supplies,
    trays: details.trays.map((tray) => trayOf(tray, values)),
    bins: details.bins.map((bin) => binOf(bin, values)),
    queued: numberAt(values, PRINTER_KEYS.queuedJobs) ?? 0,
    pagesToday: numberAt(values, PRINTER_KEYS.pagesToday) ?? 0,
    pagesWeek: numberAt(values, PRINTER_KEYS.pagesWeek) ?? 0,
    jobProgress: numberAt(values, PRINTER_KEYS.jobProgress),
    daysLeft: numberAt(values, PRINTER_KEYS.daysLeft),
    lowest: lowestOf(supplies),
  };
}
