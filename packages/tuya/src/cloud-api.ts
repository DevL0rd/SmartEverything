import { z } from 'zod';

export const DEVICE_PAGE_SIZE = 100;

export const STATUS_BATCH_SIZE = 20;

export const absentWhenEmpty = z
  .string()
  .nullish()
  .transform((value) => (value === undefined || value === '' ? null : value));

export const IDENTIFIER = z.union([z.string().min(1), z.number().int()]).transform(String);

export const CLOUD_DEVICE = z.object({
  id: z.string().min(1),
  name: z.string(),
  category: z.string(),
  product_id: z.string(),
  product_name: absentWhenEmpty,
  model: absentWhenEmpty,
  local_key: absentWhenEmpty,
  sub: z.boolean(),
  online: z.boolean(),
  gateway_id: absentWhenEmpty,
  node_id: absentWhenEmpty,
});

export type CloudDevice = z.output<typeof CLOUD_DEVICE>;

export const DEVICE_PAGE = z.object({
  list: z.array(CLOUD_DEVICE),
  has_more: z.boolean(),
  last_row_key: absentWhenEmpty,
});

const SPECIFICATION_ITEM = z.object({
  code: z.string().min(1),
  dp_id: z.number().int().nonnegative(),
  type: z.string(),
  values: z.string(),
  name: absentWhenEmpty,
});

export type SpecificationItem = z.output<typeof SPECIFICATION_ITEM>;

export const SPECIFICATION = z.object({
  functions: z.array(SPECIFICATION_ITEM).default([]),
  status: z.array(SPECIFICATION_ITEM).default([]),
});

export type Specification = z.output<typeof SPECIFICATION>;

export const STATUS_ITEM = z.object({ code: z.string().min(1), value: z.unknown() });

export type StatusItem = z.output<typeof STATUS_ITEM>;

export const DEVICE_STATUSES = z.array(
  z.object({ id: z.string().min(1), status: z.array(STATUS_ITEM) }),
);

export const HOMES = z.array(z.object({ home_id: IDENTIFIER, name: z.string() }));

export const ROOMS = z.object({
  rooms: z.array(z.object({ room_id: IDENTIFIER, name: z.string().min(1) })).default([]),
});

export const ROOM_DEVICES = z.array(z.object({ id: z.string().min(1) }));

export const COMMAND_ACCEPTED = z.literal(true);

export const IR_REMOTES = z.array(
  z.object({
    remote_id: z.string().min(1),
    remote_name: z.string().min(1),
    category_id: z.number().int(),
    brand_name: absentWhenEmpty,
  }),
);

export type IrRemote = z.output<typeof IR_REMOTES>[number];

export const IR_REMOTE_KEYS = z.object({
  category_id: z.number().int(),
  key_list: z.array(
    z.object({ key: z.string().min(1), key_id: z.number().int(), key_name: absentWhenEmpty }),
  ),
});

export type IrRemoteKeys = z.output<typeof IR_REMOTE_KEYS>;

export const IR_LEARNED = z.object({ success: z.boolean(), code: absentWhenEmpty });

export const CLOUD_PATHS = {
  devices: '/v1.3/iot-03/devices',
  specification: (deviceId: string): string => `/v1.1/devices/${deviceId}/specifications`,
  statuses: '/v1.0/iot-03/devices/status',
  commands: (deviceId: string): string => `/v1.0/iot-03/devices/${deviceId}/commands`,
  homes: (userId: string): string => `/v1.0/users/${userId}/homes`,
  rooms: (homeId: string): string => `/v1.0/homes/${homeId}/rooms`,
  roomDevices: (homeId: string, roomId: string): string =>
    `/v1.0/homes/${homeId}/rooms/${roomId}/devices`,
  irRemotes: (blasterId: string): string => `/v2.0/infrareds/${blasterId}/remotes`,
  irKeys: (blasterId: string, remoteId: string): string =>
    `/v2.0/infrareds/${blasterId}/remotes/${remoteId}/keys`,
  irKeyCommand: (blasterId: string, remoteId: string): string =>
    `/v2.0/infrareds/${blasterId}/remotes/${remoteId}/raw/command`,
  irLearningState: (blasterId: string): string => `/v2.0/infrareds/${blasterId}/learning-state`,
  irLearningCodes: (blasterId: string): string => `/v2.0/infrareds/${blasterId}/learning-codes`,
} as const;

export function deviceListQuery(
  userId: string,
  cursor: string | null,
): Readonly<Record<string, string>> {
  return {
    source_type: 'tuyaUser',
    source_id: userId,
    page_size: String(DEVICE_PAGE_SIZE),
    ...(cursor === null ? {} : { last_row_key: cursor }),
  };
}

export function commandsOf(writes: readonly { code: string; value: unknown }[]): {
  readonly commands: readonly { readonly code: string; readonly value: unknown }[];
} {
  return { commands: writes.map(({ code, value }) => ({ code, value })) };
}

export function commandBody(writes: readonly { code: string; value: unknown }[]): string {
  return JSON.stringify(commandsOf(writes));
}
