import {
  JSON_VALUE,
  PRINTER_KEYS,
  PRINTER_PLUGIN_ID,
  printerBinKey,
  printerTrayKey,
  printerTrayMediaKey,
  supplyCapabilityKey,
  type CapabilityKey,
  type DiscoveredDevice,
  type JsonValue,
  type PrinterActionName,
  type PrinterFeatures,
} from '@smarteverything/domain';
import { OPERATION } from '@smarteverything/ipp';
import { z } from 'zod';
import type { ToolCaller } from '../contract';
import { capabilitiesOf } from './device-capabilities';
import { detailsOf } from './device-details';
import type { PrinterModel } from './model';
import { adminUrlOf } from './records';

const DETAILS_JSON = z.record(z.string(), JSON_VALUE);

export const SAMPLED_PREFIXES: readonly string[] = [
  'raw:printer.supply.',
  'raw:printer.tray.',
  'raw:printer.bin.',
];

export function externalIdOf(uuid: string): string {
  return `${PRINTER_PLUGIN_ID}:${uuid}`;
}

function supports(model: PrinterModel, ...operations: readonly number[]): boolean {
  const listed = model.description.capabilities.operations;
  const refused = model.record.disabledOps;
  return operations.every(
    (operation) => listed.includes(operation) && !refused.includes(operation),
  );
}

export function featuresOf(model: PrinterModel): PrinterFeatures {
  return {
    subscriptions: supports(
      model,
      OPERATION.createPrinterSubscriptions,
      OPERATION.getNotifications,
    ),
    identify: supports(model, OPERATION.identifyPrinter),
    pause: supports(model, OPERATION.pausePrinter, OPERATION.resumePrinter),
    hold: supports(model, OPERATION.holdJob, OPERATION.releaseJob),
    cancelAll: supports(model, OPERATION.cancelJobs) || supports(model, OPERATION.purgeJobs),
    validate: supports(model, OPERATION.validateJob),
    cancelJob: supports(model, OPERATION.cancelJob),
  };
}

export function describePrinter(model: PrinterModel): DiscoveredDevice {
  const { identity } = model.description;
  const features = featuresOf(model);
  return {
    provider: 'local',
    externalId: externalIdOf(model.record.uuid),
    parentExternalId: null,
    kind: 'printer',
    name: model.record.customName ?? model.record.name,
    model: identity.makeAndModel ?? identity.model ?? 'Network printer',
    manufacturer: identity.manufacturer ?? identity.makeAndModel?.split(' ')[0] ?? 'Printer',
    room: model.record.room,
    online: model.online,
    capabilities: [...capabilitiesOf(model, features)],
    details: DETAILS_JSON.parse(detailsOf(model, features)),
  };
}

function needsAttention(model: PrinterModel): boolean {
  const supplyTrouble = model.supplies.some((s) => s.standing === 'low' || s.standing === 'out');
  return model.problems.length > 0 || supplyTrouble;
}

function pageReadings(model: PrinterModel): readonly (readonly [CapabilityKey, JsonValue])[] {
  const { counters } = model.status;
  const counted: readonly (readonly [CapabilityKey, number | null])[] = [
    [PRINTER_KEYS.pagesTotal, counters.pages],
    [PRINTER_KEYS.pagesColor, counters.color],
    [PRINTER_KEYS.pagesMono, counters.mono],
  ];
  return counted.flatMap(([key, value]) => (value === null ? [] : [[key, value] as const]));
}

function dynamicReadings(model: PrinterModel): readonly (readonly [CapabilityKey, JsonValue])[] {
  return [
    ...model.supplies.map((supply) => [supplyCapabilityKey(supply.key), supply.level] as const),
    ...model.trays.flatMap((tray) => [
      [printerTrayKey(tray.number), tray.level] as const,
      [printerTrayMediaKey(tray.number), tray.media ?? ''] as const,
    ]),
    ...model.bins.map((bin) => [printerBinKey(bin.number), bin.level] as const),
  ];
}

export function readingsOf(model: PrinterModel): ReadonlyMap<CapabilityKey, JsonValue> {
  const { status } = model;
  const readings = new Map<CapabilityKey, JsonValue>([
    [PRINTER_KEYS.state, model.state],
    [PRINTER_KEYS.queue, model.paused ? 'paused' : 'running'],
    [PRINTER_KEYS.accepting, status.accepting ?? true],
    [PRINTER_KEYS.queuedJobs, status.queuedJobs ?? 0],
    [PRINTER_KEYS.problem, model.problems[0]?.title ?? 'none'],
    [PRINTER_KEYS.attention, needsAttention(model)],
    [PRINTER_KEYS.powerState, model.power],
    [PRINTER_KEYS.jobProgress, model.jobProgress],
    [PRINTER_KEYS.pagesToday, model.pagesToday],
    [PRINTER_KEYS.pagesWeek, model.pagesWeek],
    ...pageReadings(model),
    ...dynamicReadings(model),
  ]);
  if (model.supplies.length > 0) {
    readings.set(
      PRINTER_KEYS.daysLeft,
      model.daysLeft === null ? null : Math.round(model.daysLeft),
    );
  }
  if (model.costMonth !== null) readings.set(PRINTER_KEYS.costMonth, model.costMonth);
  const { firmware } = model.description.identity;
  if (firmware !== null) readings.set('firmware', firmware);
  return readings;
}

const OWNER_ACTIONS: readonly PrinterActionName[] = [
  'add',
  'rescan',
  'trust_certificate',
  'credentials',
  'clear_history',
  'forget',
];

export function actionsOf(model: PrinterModel, caller: ToolCaller): readonly PrinterActionName[] {
  const features = featuresOf(model);
  const operations = model.description.capabilities.operations;
  const printing =
    operations.includes(OPERATION.printJob) || operations.includes(OPERATION.createJob);
  const allowed: readonly (readonly [boolean, PrinterActionName])[] = [
    [printing, 'print'],
    [printing, 'test_page'],
    [features.cancelJob, 'cancel'],
    [features.hold, 'hold'],
    [features.hold, 'release'],
    [features.identify, 'identify'],
    [features.pause, 'pause'],
    [features.pause, 'resume'],
    [adminUrlOf(model.record, model.description.identity.moreInfo) !== null, 'open_page'],
    [true, 'configure'],
  ];
  const own = allowed.flatMap(([on, name]) => (on ? [name] : []));
  if (caller.role !== 'owner') return own;
  return [...own, ...OWNER_ACTIONS, ...(features.cancelAll ? (['cancel_all'] as const) : [])];
}
