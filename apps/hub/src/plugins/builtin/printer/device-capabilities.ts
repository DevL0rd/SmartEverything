import {
  PRINTER_KEYS,
  printerBinKey,
  printerTrayKey,
  printerTrayMediaKey,
  supplyCapabilityKey,
  type DeviceCapability,
} from '@smarteverything/domain';
import type { PrinterFeatures } from '@smarteverything/domain';
import type { PrinterModel } from './model';

type Reading = Omit<DeviceCapability, 'key'>;

export function numeric(label: string, unit: string, max: number): Reading {
  return { label, access: 'read', value: { kind: 'number', min: 0, max, step: 1, unit } };
}

function statusCapabilities(features: PrinterFeatures): readonly DeviceCapability[] {
  return [
    {
      key: PRINTER_KEYS.state,
      label: 'Printer state',
      access: 'read',
      value: { kind: 'enum', options: ['idle', 'printing', 'stopped'] },
    },
    {
      key: PRINTER_KEYS.queue,
      label: 'Print queue',
      access: features.pause ? 'read_write' : 'read',
      value: { kind: 'enum', options: ['running', 'paused'] },
    },
    {
      key: PRINTER_KEYS.accepting,
      label: 'Accepting jobs',
      access: 'read',
      value: { kind: 'boolean' },
    },
    { key: PRINTER_KEYS.queuedJobs, ...numeric('Queued jobs', 'jobs', 1000) },
    {
      key: PRINTER_KEYS.problem,
      label: 'Problem',
      access: 'read',
      value: { kind: 'text', maxLength: 200 },
    },
    {
      key: PRINTER_KEYS.attention,
      label: 'Needs attention',
      access: 'read',
      value: { kind: 'boolean' },
    },
    {
      key: PRINTER_KEYS.powerState,
      label: 'Power state',
      access: 'read',
      value: { kind: 'enum', options: ['awake', 'standby', 'hibernate', 'off'] },
    },
    { key: PRINTER_KEYS.jobProgress, ...numeric('Job progress', '%', 100) },
  ];
}

function pageCapabilities(model: PrinterModel): readonly DeviceCapability[] {
  const { counters } = model.status;
  const optional: readonly (readonly [number | null, DeviceCapability])[] = [
    [counters.pages, { key: PRINTER_KEYS.pagesTotal, ...numeric('Pages printed', 'pages', 1e9) }],
    [counters.color, { key: PRINTER_KEYS.pagesColor, ...numeric('Colour pages', 'pages', 1e9) }],
    [counters.mono, { key: PRINTER_KEYS.pagesMono, ...numeric('Mono pages', 'pages', 1e9) }],
  ];
  return [
    ...optional.flatMap(([value, capability]) => (value === null ? [] : [capability])),
    { key: PRINTER_KEYS.pagesToday, ...numeric('Pages today', 'pages', 1e6) },
    { key: PRINTER_KEYS.pagesWeek, ...numeric('Pages this week', 'pages', 1e6) },
  ];
}

function supplyCapabilities(model: PrinterModel): readonly DeviceCapability[] {
  const standing: readonly DeviceCapability[] = model.supplies.map((supply) => ({
    key: supplyCapabilityKey(supply.key),
    ...numeric(supply.name, '%', 100),
  }));
  return [
    ...(model.supplies.length === 0
      ? []
      : [{ key: PRINTER_KEYS.daysLeft, ...numeric('Days of ink left', 'days', 3650) }]),
    ...(model.costMonth === null
      ? []
      : [
          {
            key: PRINTER_KEYS.costMonth,
            ...numeric('Spend this month', model.record.settings.currency, 1e9),
          },
        ]),
    ...standing,
  ];
}

function trayCapabilities(model: PrinterModel): readonly DeviceCapability[] {
  return [
    ...model.trays.flatMap((tray): readonly DeviceCapability[] => [
      { key: printerTrayKey(tray.number), ...numeric(`Paper in ${tray.name}`, '%', 100) },
      {
        key: printerTrayMediaKey(tray.number),
        label: `Paper size in ${tray.name}`,
        access: 'read',
        value: { kind: 'text', maxLength: 120 },
      },
    ]),
    ...model.bins.map((bin): DeviceCapability => ({
      key: printerBinKey(bin.number),
      ...numeric(`Output ${bin.name} full`, '%', 100),
    })),
  ];
}

function actionCapabilities(
  model: PrinterModel,
  features: PrinterFeatures,
): readonly DeviceCapability[] {
  const firmware = model.description.identity.firmware;
  return [
    {
      key: PRINTER_KEYS.testPage,
      label: 'Print a test page',
      access: 'write',
      value: { kind: 'action' },
    },
    ...(features.identify
      ? [
          {
            key: PRINTER_KEYS.identify,
            label: 'Find the printer',
            access: 'write' as const,
            value: { kind: 'action' as const, arguments: ['how'] },
          },
        ]
      : []),
    ...(firmware === null
      ? []
      : [
          {
            key: 'firmware' as const,
            label: 'Firmware',
            access: 'read' as const,
            value: { kind: 'text' as const, maxLength: 80 },
          },
        ]),
  ];
}

export function capabilitiesOf(
  model: PrinterModel,
  features: PrinterFeatures,
): readonly DeviceCapability[] {
  return [
    ...statusCapabilities(features),
    ...pageCapabilities(model),
    ...supplyCapabilities(model),
    ...trayCapabilities(model),
    ...actionCapabilities(model, features),
  ];
}
