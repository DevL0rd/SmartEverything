import { z } from 'zod';

export const LAUNDRY_NOTICE_KINDS = [
  'finished',
  'fault',
  'detergent',
  'softener',
  'filter',
  'unload',
] as const;

export type LaundryNoticeKind = (typeof LAUNDRY_NOTICE_KINDS)[number];

export const LAUNDRY_NOTICE_KIND = z.enum(LAUNDRY_NOTICE_KINDS);

export const UNLOAD_NOTICE_MINUTES_DEFAULT = 30;

export const UNLOAD_NOTICE_MINUTES = z.number().int().min(1).max(720);

export const LAUNDRY_NOTICE_SETTING = z.strictObject({
  off: z
    .array(LAUNDRY_NOTICE_KIND)
    .describe('Notices this machine does not send; every other notice is on'),
  unloadMinutes: UNLOAD_NOTICE_MINUTES.describe(
    'Minutes a finished load may wait in the drum before the unload reminder',
  ),
});

export type LaundryNoticeSetting = z.infer<typeof LAUNDRY_NOTICE_SETTING>;

export const LAUNDRY_NOTICES = z
  .record(z.uuid(), LAUNDRY_NOTICE_SETTING)
  .describe(
    'Phone notices of each washing machine or dryer, by device id, shared by the whole household: finished (cycle done), fault, detergent (low), softener (low), filter (needs cleaning), unload (laundry still waiting unloadMinutes after the cycle). A machine without an entry sends every notice and reminds after 30 minutes. Change with call_operation updateLaundryNotices',
  );

export type LaundryNotices = z.infer<typeof LAUNDRY_NOTICES>;

export const DEFAULT_LAUNDRY_NOTICE: LaundryNoticeSetting = {
  off: [],
  unloadMinutes: UNLOAD_NOTICE_MINUTES_DEFAULT,
};

export const LAUNDRY_NOTICE_CHANGE = z
  .strictObject({
    on: z
      .partialRecord(LAUNDRY_NOTICE_KIND, z.boolean())
      .describe('Notice kind to true (send it) or false (do not send it)'),
    unloadMinutes: UNLOAD_NOTICE_MINUTES.describe(
      'Minutes a finished load may wait in the drum before the unload reminder',
    ),
  })
  .partial()
  .refine((change) => change.on !== undefined || change.unloadMinutes !== undefined, {
    message: 'name notices to switch or the unload minutes',
  });

export type LaundryNoticeChange = z.infer<typeof LAUNDRY_NOTICE_CHANGE>;

export function laundryNoticeOf(notices: LaundryNotices, deviceId: string): LaundryNoticeSetting {
  return notices[deviceId] ?? DEFAULT_LAUNDRY_NOTICE;
}

export function laundryNoticeOn(
  notices: LaundryNotices,
  deviceId: string,
  kind: LaundryNoticeKind,
): boolean {
  return !laundryNoticeOf(notices, deviceId).off.includes(kind);
}

export function withLaundryNoticeChange(
  setting: LaundryNoticeSetting,
  change: LaundryNoticeChange,
): LaundryNoticeSetting {
  const switched = change.on ?? {};
  return {
    off: LAUNDRY_NOTICE_KINDS.filter((kind) => !(switched[kind] ?? !setting.off.includes(kind))),
    unloadMinutes: change.unloadMinutes ?? setting.unloadMinutes,
  };
}

interface LaundryNoticeWording {
  readonly label: string;
  readonly body: (machine: string) => string;
}

export const LAUNDRY_NOTICE_WORDING: Readonly<Record<LaundryNoticeKind, LaundryNoticeWording>> = {
  finished: { label: 'Laundry done', body: (machine) => `${machine} has finished its cycle.` },
  fault: {
    label: 'Fault',
    body: (machine) => `${machine} reported a fault. Open it to see what to try.`,
  },
  detergent: { label: 'Detergent low', body: (machine) => `${machine} is low on detergent.` },
  softener: { label: 'Softener low', body: (machine) => `${machine} is low on softener.` },
  filter: {
    label: 'Filter needs cleaning',
    body: (machine) => `${machine} needs its filter cleaned.`,
  },
  unload: {
    label: 'Still needs unloading',
    body: (machine) => `The laundry in ${machine} is waiting to be unloaded.`,
  },
};

export const DEVICE_NOTICE_PUSH_DATA = z.object({
  kind: z.literal('device_notice'),
  notice: LAUNDRY_NOTICE_KIND,
  deviceId: z.uuid(),
});

export type DeviceNoticePushData = z.infer<typeof DEVICE_NOTICE_PUSH_DATA>;
