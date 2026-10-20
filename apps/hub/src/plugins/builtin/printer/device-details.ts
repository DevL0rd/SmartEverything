import {
  PRINTER_DETAILS,
  PRINTER_PLUGIN_ID,
  type PrinterDetails,
  type PrinterFeatures,
  type PrinterVariant,
} from '@smarteverything/domain';
import type { PrinterModel } from './model';
import { adminUrlOf } from './records';

const TANK_WORDS = /tank|ecotank|megatank|ink ?tank/iu;

export function variantOf(model: PrinterModel): PrinterVariant {
  const { kinds, makeAndModel } = model.description.identity;
  if (kinds.includes('receipt')) return 'receipt';
  if (kinds.includes('label') || kinds.includes('roll')) return 'label';
  if (kinds.includes('photo')) return 'photo';
  if (model.supplies.some((supply) => supply.kind === 'toner')) return 'laser';
  return TANK_WORDS.test(makeAndModel ?? '') ? 'tank' : 'inkjet';
}

function printerFacts(model: PrinterModel, features: PrinterFeatures): Partial<PrinterDetails> {
  const { identity, capabilities } = model.description;
  return {
    pluginId: PRINTER_PLUGIN_ID,
    uuid: model.record.uuid,
    variant: variantOf(model),
    mfp: false,
    colour: capabilities.color ?? model.supplies.some((supply) => supply.slot === 'cyan'),
    duplex: capabilities.sides.some((side) => side.startsWith('two-sided')),
    ppm: capabilities.pagesPerMinute,
    ppmColour: capabilities.pagesPerMinuteColor,
    formats: [...capabilities.formats],
    security: model.secure ? 'ipps' : 'ipp',
    pinned: model.record.pin !== null,
    uri: model.record.uri,
    adminUrl: adminUrlOf(model.record, identity.moreInfo),
    iconUrl: identity.icons[1] ?? identity.icons[0] ?? null,
    location: identity.location,
    serial: identity.serial,
    firmware: identity.firmware,
    versions: [...capabilities.versions],
    authentication: [...capabilities.authentication],
    resolutions: [...capabilities.resolutions],
    features,
    wifiSsid: identity.wifiSsid,
  };
}

function liveFacts(model: PrinterModel): Partial<PrinterDetails> {
  const { status } = model;
  return {
    reportsSupplies: model.supplies.length > 0,
    reportsCounters: status.counters.pages !== null,
    supplies: model.supplies.map((supply) => ({
      key: supply.key,
      slot: supply.slot,
      name: supply.name,
      colour: supply.colour,
      kind: supply.kind,
      consumed: supply.consumed,
      lowLevel: supply.lowLevel,
      standing: supply.standing,
      threshold: supply.threshold,
      daysLeft: supply.forecast === null ? null : Math.round(supply.forecast.daysLeft),
    })),
    trays: model.trays.map((tray) => ({
      number: tray.number,
      name: tray.name,
      capacity: tray.capacity,
    })),
    bins: model.bins.map((bin) => ({ number: bin.number, name: bin.name, capacity: bin.capacity })),
    stateMessage: status.message,
    operatorMessage: status.operatorMessage,
    problems: model.problems.map((problem) => ({
      keyword: problem.keyword,
      severity: problem.severity,
      part: problem.part,
    })),
    alerts: status.alerts.map((alert) => ({
      code: alert.code,
      severity: alert.severity,
      group: alert.group,
      description: alert.description,
    })),
    activeJob: model.activeJob,
    lastSeen: model.record.lastSeen,
    gapOpen: model.gapOpen,
    uptimeSeconds: status.upTime,
  };
}

export function detailsOf(model: PrinterModel, features: PrinterFeatures): PrinterDetails {
  return PRINTER_DETAILS.parse({ ...printerFacts(model, features), ...liveFacts(model) });
}
