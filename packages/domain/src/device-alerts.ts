import { z } from 'zod';

export const DEVICE_ALERTS_PREF = z.strictObject({
  muted: z
    .array(z.string().min(1))
    .describe(
      'Ids of devices and cameras whose alerts (doorbell, calls, alarms, leaks, smoke) do not reach this person’s phones; every other device alerts. Ids come from find_devices; send the whole list',
    ),
});

export type DeviceAlertsPref = z.infer<typeof DEVICE_ALERTS_PREF>;

export function deviceAlertsOn(pref: DeviceAlertsPref, deviceId: string): boolean {
  return !pref.muted.includes(deviceId);
}

export function withDeviceAlerts(
  pref: DeviceAlertsPref,
  deviceId: string,
  on: boolean,
): DeviceAlertsPref {
  const others = pref.muted.filter((id) => id !== deviceId);
  return { muted: on ? others : [...others, deviceId] };
}
