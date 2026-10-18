import { z } from 'zod';
import { computerRoleOfModel } from './node/computer-role';

export const HISTORY_SOURCE_CLASSES = [
  'computers',
  'hub',
  'router',
  'syncthing',
  'adguard',
  'generic',
] as const;

export const HISTORY_SOURCE_CLASS = z.enum(HISTORY_SOURCE_CLASSES);

export type HistorySourceClass = z.infer<typeof HISTORY_SOURCE_CLASS>;

export const HISTORY_SOURCE_CLASS_LABELS: Readonly<Record<HistorySourceClass, string>> = {
  computers: 'Computers',
  hub: 'Hub',
  router: 'Router',
  syncthing: 'Syncthing',
  adguard: 'AdGuard',
  generic: 'Other sources',
};

export const HISTORY_INTERVAL_MIN_MS = 1000;

export const HISTORY_INTERVAL_MAX_MS = 60_000;

export const HISTORY_INTERVAL_DEFAULT_MS = 1000;

export const HISTORY_WINDOW_MIN_MS = 60_000;

export const HISTORY_WINDOW_MAX_MS = 24 * 60 * 60_000;

export const HISTORY_WINDOW_DEFAULT_MS = 30 * 60_000;

export const HISTORY_INTERVAL_MS = z
  .int()
  .min(HISTORY_INTERVAL_MIN_MS)
  .max(HISTORY_INTERVAL_MAX_MS)
  .multipleOf(HISTORY_INTERVAL_MIN_MS);

export const HISTORY_WINDOW_MS = z
  .int()
  .min(HISTORY_WINDOW_MIN_MS)
  .max(HISTORY_WINDOW_MAX_MS)
  .multipleOf(HISTORY_WINDOW_MIN_MS);

export const HISTORY_POLICY = z.strictObject({
  interval_ms: HISTORY_INTERVAL_MS,
  window_ms: HISTORY_WINDOW_MS,
});

export type HistoryPolicy = z.infer<typeof HISTORY_POLICY>;

export const HISTORY_OVERRIDE = z.strictObject({
  interval_ms: HISTORY_INTERVAL_MS.nullable(),
  window_ms: HISTORY_WINDOW_MS.nullable(),
});

export type HistoryOverride = z.infer<typeof HISTORY_OVERRIDE>;

export const DEFAULT_HISTORY_POLICY: HistoryPolicy = {
  interval_ms: HISTORY_INTERVAL_DEFAULT_MS,
  window_ms: HISTORY_WINDOW_DEFAULT_MS,
};

export const HISTORY_SETTINGS = z.strictObject({
  classes: z.strictObject({
    computers: HISTORY_POLICY,
    hub: HISTORY_POLICY,
    router: HISTORY_POLICY,
    syncthing: HISTORY_POLICY,
    adguard: HISTORY_POLICY,
    generic: HISTORY_POLICY,
  }),
  devices: z.record(z.uuid(), HISTORY_OVERRIDE),
});

export type HistorySettings = z.infer<typeof HISTORY_SETTINGS>;

export const DEFAULT_HISTORY_SETTINGS: HistorySettings = {
  classes: {
    computers: DEFAULT_HISTORY_POLICY,
    hub: DEFAULT_HISTORY_POLICY,
    router: DEFAULT_HISTORY_POLICY,
    syncthing: DEFAULT_HISTORY_POLICY,
    adguard: DEFAULT_HISTORY_POLICY,
    generic: DEFAULT_HISTORY_POLICY,
  },
  devices: {},
};

export const HISTORY_SETTINGS_CHANGE = z
  .strictObject({
    classes: z.partialRecord(HISTORY_SOURCE_CLASS, HISTORY_POLICY),
    devices: z.record(z.uuid(), HISTORY_OVERRIDE.nullable()),
  })
  .partial()
  .refine((change) => change.classes !== undefined || change.devices !== undefined, {
    message: 'name classes or devices to change',
  });

export type HistorySettingsChange = z.infer<typeof HISTORY_SETTINGS_CHANGE>;

export function historyClassOf(device: {
  readonly kind: string;
  readonly model: string;
}): HistorySourceClass {
  if (device.kind === 'computer')
    return computerRoleOfModel(device.model) === 'hub' ? 'hub' : 'computers';
  if (device.kind === 'router') return 'router';
  if (device.kind === 'file_sync') return 'syncthing';
  if (device.kind === 'dns_filter') return 'adguard';
  return 'generic';
}

export function effectiveHistoryPolicy(
  settings: HistorySettings,
  deviceId: string,
  sourceClass: HistorySourceClass,
): HistoryPolicy {
  const base = settings.classes[sourceClass];
  const override = settings.devices[deviceId];
  if (override === undefined) return base;
  return {
    interval_ms: override.interval_ms ?? base.interval_ms,
    window_ms: override.window_ms ?? base.window_ms,
  };
}

export function applyHistorySettingsChange(
  settings: HistorySettings,
  change: HistorySettingsChange,
): HistorySettings {
  const classes = { ...settings.classes, ...change.classes };
  const changed = Object.entries(change.devices ?? {});
  const removed = new Set(changed.filter(([, override]) => override === null).map(([id]) => id));
  const devices: Record<string, HistoryOverride> = {};
  for (const [deviceId, override] of [...Object.entries(settings.devices), ...changed]) {
    if (override !== null && !removed.has(deviceId)) devices[deviceId] = override;
  }
  return { classes, devices };
}

export function historyCapacity(policy: HistoryPolicy): number {
  return Math.ceil(policy.window_ms / policy.interval_ms);
}
