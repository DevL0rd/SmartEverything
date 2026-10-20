import {
  PRINTER_DETAILS,
  PRINTER_KEYS,
  printerBinKey,
  printerTrayKey,
  supplyCapabilityKey,
  type PrinterDetails,
  type PrinterSupplyDetail,
} from '@smarteverything/domain';
import {
  printerLiveOf,
  type DeviceReadings,
  type PrinterLive,
} from '../../../features/device-visuals/model/printer-live';

function supply(
  key: string,
  slot: PrinterSupplyDetail['slot'],
  colour: string,
  extra: Partial<PrinterSupplyDetail> = {},
): PrinterSupplyDetail {
  return {
    key,
    slot,
    name: '',
    colour,
    kind: 'ink',
    consumed: true,
    lowLevel: 15,
    standing: 'ok',
    threshold: 15,
    daysLeft: 40,
    ...extra,
  };
}

export const INKS: readonly PrinterSupplyDetail[] = [
  supply('black', 'black', '#000000', { name: 'Black' }),
  supply('cyan', 'cyan', '#00ffff', { name: 'Cyan' }),
  supply('magenta', 'magenta', '#ff00ff', { name: 'Magenta' }),
  supply('yellow', 'yellow', '#ffff00', { name: 'Yellow' }),
  supply('waste', 'waste', '#7a7468', {
    name: 'Waste tank',
    kind: 'waste',
    consumed: false,
    daysLeft: 400,
  }),
];

export function detailsOf(extra: Partial<PrinterDetails> = {}): PrinterDetails {
  return PRINTER_DETAILS.parse({
    pluginId: 'printer',
    uuid: '5ea8558e-a16f-3ee9-703c-df37e677edab',
    variant: 'tank',
    mfp: false,
    colour: true,
    duplex: true,
    ppm: 12,
    ppmColour: 8,
    formats: ['application/pdf', 'image/jpeg'],
    security: 'ipps',
    pinned: true,
    uri: 'ipps://printer.local:631/ipp/print',
    adminUrl: 'https://printer.local/',
    iconUrl: null,
    location: 'Hall',
    serial: null,
    firmware: '1.2.3',
    versions: ['1.1', '2.0'],
    authentication: ['none'],
    resolutions: [600],
    features: {
      subscriptions: false,
      identify: true,
      pause: true,
      hold: false,
      cancelAll: true,
      validate: true,
      cancelJob: true,
    },
    reportsSupplies: true,
    reportsCounters: true,
    supplies: INKS,
    trays: [{ number: 1, name: 'main', capacity: 250 }],
    bins: [{ number: 1, name: 'face-down', capacity: null }],
    stateMessage: 'Idle.',
    operatorMessage: null,
    problems: [],
    alerts: [],
    activeJob: null,
    lastSeen: '2026-10-18T10:00:00+00:00',
    gapOpen: false,
    wifiSsid: null,
    uptimeSeconds: 5000,
    ...extra,
  });
}

export function readings(values: Readonly<Record<string, unknown>>): DeviceReadings {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
        ? [[key, { value }] as const]
        : [],
    ),
  );
}

export const IDLE_READINGS: DeviceReadings = readings({
  [PRINTER_KEYS.state]: 'idle',
  [PRINTER_KEYS.queue]: 'running',
  [PRINTER_KEYS.powerState]: 'awake',
  [PRINTER_KEYS.queuedJobs]: 0,
  [PRINTER_KEYS.pagesToday]: 14,
  [PRINTER_KEYS.pagesWeek]: 63,
  [PRINTER_KEYS.jobProgress]: null,
  [PRINTER_KEYS.daysLeft]: 19,
  [supplyCapabilityKey('black')]: 80,
  [supplyCapabilityKey('cyan')]: 60,
  [supplyCapabilityKey('magenta')]: 30,
  [supplyCapabilityKey('yellow')]: 90,
  [supplyCapabilityKey('waste')]: 20,
  [printerTrayKey(1)]: 60,
  [`${printerTrayKey(1)}.media`]: 'A4',
  [printerBinKey(1)]: 10,
});

export function liveOf(
  options: {
    readonly details?: Partial<PrinterDetails>;
    readonly values?: Readonly<Record<string, unknown>>;
    readonly online?: boolean;
  } = {},
): PrinterLive {
  return printerLiveOf(
    detailsOf(options.details),
    { ...IDLE_READINGS, ...readings(options.values ?? {}) },
    options.online ?? true,
  );
}
