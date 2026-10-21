import { z } from 'zod';
const PERCENT = z.number().min(0).max(100);

export const POWER_MODES = ['power_saver', 'balanced', 'performance'] as const;

export type PowerMode = (typeof POWER_MODES)[number];

export const BATTERY_STATES = ['charging', 'discharging', 'full', 'idle', 'unknown'] as const;

export const BATTERY = z.strictObject({
  level: PERCENT,
  state: z.enum(BATTERY_STATES),
  pluggedIn: z.boolean(),
  minutesLeft: z.int().nonnegative().nullable(),
  healthPercent: PERCENT.nullable(),
  drawWatts: z.number().nonnegative().nullable(),
});

export type Battery = z.infer<typeof BATTERY>;

export const KEYBOARD_LAYOUT = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const WIFI_NETWORK = z.strictObject({
  ssid: z.string().min(1),
  signalPercent: PERCENT.nullable(),
  secured: z.boolean(),
  known: z.boolean(),
  connected: z.boolean(),
});

export type WifiNetwork = z.infer<typeof WIFI_NETWORK>;

export const BLUETOOTH_DEVICE = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  connected: z.boolean(),
  batteryPercent: PERCENT.nullable(),
});

export type BluetoothDevice = z.infer<typeof BLUETOOTH_DEVICE>;

export const USB_DEVICE = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  vendor: z.string().min(1).nullable(),
  speedMbps: z.number().positive().nullable(),
});

export type UsbDevice = z.infer<typeof USB_DEVICE>;

export const SYSTEM_STATE = z.strictObject({
  battery: BATTERY.nullable(),
  powerMode: z
    .strictObject({ current: z.enum(POWER_MODES), offered: z.array(z.enum(POWER_MODES)) })
    .nullable(),
  dnd: z.boolean().nullable(),
  keyboard: z
    .strictObject({ layouts: z.array(KEYBOARD_LAYOUT), current: z.string().min(1) })
    .nullable(),
  wifi: z.strictObject({ enabled: z.boolean(), networks: z.array(WIFI_NETWORK) }).nullable(),
  bluetooth: z
    .strictObject({ enabled: z.boolean(), devices: z.array(BLUETOOTH_DEVICE) })
    .nullable(),
  usb: z.array(USB_DEVICE),
});

export type SystemState = z.infer<typeof SYSTEM_STATE>;

export const SYSTEM_CHANGE = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('power_mode'), mode: z.enum(POWER_MODES) }),
  z.strictObject({ action: z.literal('dnd'), enabled: z.boolean() }),
  z.strictObject({
    action: z.literal('keyboard_layout'),
    layout: z.string().trim().min(1).describe('A layout id from computer_read, or its name'),
  }),
  z.strictObject({ action: z.literal('wifi'), enabled: z.boolean() }),
  z.strictObject({
    action: z.literal('wifi_connect'),
    network: z.string().trim().min(1).describe('The name of a saved network'),
  }),
  z.strictObject({ action: z.literal('bluetooth'), enabled: z.boolean() }),
  z.strictObject({
    action: z.literal('bluetooth_device'),
    device: z.string().trim().min(1).describe('A device id from computer_read, or its name'),
    connected: z.boolean(),
  }),
]);

export type SystemChange = z.infer<typeof SYSTEM_CHANGE>;

export const STARTUP_ENTRY = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  command: z.string(),
  enabled: z.boolean(),
  global: z.boolean(),
});

export type StartupEntry = z.infer<typeof STARTUP_ENTRY>;

export const STARTUP_STATE = z.strictObject({ entries: z.array(STARTUP_ENTRY) });

export type StartupState = z.infer<typeof STARTUP_STATE>;

export const STARTUP_CHANGE = z.strictObject({
  action: z.literal('startup_app'),
  id: z.string().trim().min(1).describe('A startup app id from computer_read, or its name'),
  enabled: z.boolean(),
});

export type StartupChange = z.infer<typeof STARTUP_CHANGE>;

export const SERVICE_OPERATIONS = ['start', 'stop', 'restart', 'enable', 'disable'] as const;

export type ServiceOperation = (typeof SERVICE_OPERATIONS)[number];

export const SERVICE_STATES = ['active', 'inactive', 'failed', 'activating', 'other'] as const;

export const SERVICE_ROW = z.strictObject({
  unit: z.string().min(1),
  description: z.string(),
  state: z.enum(SERVICE_STATES),
  startsAtLogin: z.boolean().nullable(),
  system: z.boolean(),
});

export type ServiceRow = z.infer<typeof SERVICE_ROW>;

export const TIMER_ROW = z.strictObject({
  unit: z.string().min(1),
  description: z.string(),
  nextRunAt: z.iso.datetime({ offset: true }).nullable(),
  lastRunAt: z.iso.datetime({ offset: true }).nullable(),
});

export type TimerRow = z.infer<typeof TIMER_ROW>;

export const SERVICES_STATE = z.strictObject({
  services: z.array(SERVICE_ROW),
  timers: z.array(TIMER_ROW),
});

export type ServicesState = z.infer<typeof SERVICES_STATE>;

export const SERVICE_CHANGE = z.strictObject({
  action: z.literal('service'),
  unit: z.string().trim().min(1).describe('A unit from computer_read services, or its name'),
  operation: z.enum(SERVICE_OPERATIONS),
});

export type ServiceChange = z.infer<typeof SERVICE_CHANGE>;

export const SERVICE_REQUEST = SERVICE_CHANGE.extend({ confirm: z.boolean().optional() });

export type ServiceRequest = z.infer<typeof SERVICE_REQUEST>;

export const SYSTEM_TOOL_CHANGE = z.discriminatedUnion('action', [
  ...SYSTEM_CHANGE.options,
  STARTUP_CHANGE,
  SERVICE_CHANGE,
]);

export type SystemToolChange = z.infer<typeof SYSTEM_TOOL_CHANGE>;
