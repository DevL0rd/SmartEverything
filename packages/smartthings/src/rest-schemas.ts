import { JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';

export const LINKS = z.object({ next: z.object({ href: z.url() }).nullish() }).nullish();

const LOCATION = z.object({ locationId: z.string().min(1), name: z.string() });

export const LOCATION_LIST = z.object({ items: z.array(LOCATION), _links: LINKS });

const ROOM = z.object({
  roomId: z.string().min(1),
  locationId: z.string().min(1),
  name: z.string(),
});

export const ROOM_LIST = z.object({ items: z.array(ROOM), _links: LINKS });

const ATTRIBUTE_STATE = z.object({
  value: JSON_VALUE.optional(),
  unit: z.string().nullish(),
  data: z.record(z.string(), JSON_VALUE).nullish(),
  timestamp: z.string().nullish(),
});

const CAPABILITY_STATUS = z.record(z.string(), ATTRIBUTE_STATE);

const COMPONENT_STATUS = z.record(z.string(), CAPABILITY_STATUS);

export type ComponentStatus = z.infer<typeof COMPONENT_STATUS>;

const HEALTH_STATES = ['ONLINE', 'OFFLINE', 'UNHEALTHY', 'UNKNOWN'] as const;

const HEALTH_STATE = z.object({ state: z.enum(HEALTH_STATES) });

export const DEVICE_STATUS = z.object({
  components: z.record(z.string(), COMPONENT_STATUS),
  healthState: HEALTH_STATE.nullish(),
});

export type DeviceStatus = z.infer<typeof DEVICE_STATUS>;

const CATEGORY_TYPES = ['manufacturer', 'user'] as const;

const CATEGORY = z.object({ name: z.string().min(1), categoryType: z.enum(CATEGORY_TYPES) });

const CAPABILITY_REFERENCE = z.object({
  id: z.string().min(1),
  version: z.number().int().positive().optional(),
  status: CAPABILITY_STATUS.nullish(),
});

const COMPONENT = z.object({
  id: z.string().min(1),
  label: z.string().nullish(),
  capabilities: z.array(CAPABILITY_REFERENCE),
  categories: z.array(CATEGORY),
});

export type Component = z.infer<typeof COMPONENT>;

export const DEVICE = z.object({
  deviceId: z.string().min(1),
  name: z.string().nullish(),
  label: z.string().nullish(),
  manufacturerName: z.string().min(1),
  presentationId: z.string().nullish(),
  deviceTypeName: z.string().nullish(),
  type: z.string().nullish(),
  locationId: z.string().min(1),
  roomId: z.string().nullish(),
  parentDeviceId: z.string().nullish(),
  components: z.array(COMPONENT).min(1),
  ocf: z
    .object({ modelNumber: z.string().nullish(), firmwareVersion: z.string().nullish() })
    .nullish(),
  viper: z.object({ modelName: z.string().nullish(), swVersion: z.string().nullish() }).nullish(),
  healthState: HEALTH_STATE.nullish(),
});

export type Device = z.infer<typeof DEVICE>;

export const DEVICE_LIST = z.object({ items: z.array(z.unknown()), _links: LINKS });

const COMMAND_STATUSES = ['ACCEPTED', 'COMPLETED', 'FAILED'] as const;

export const COMMAND_RESPONSE = z.object({
  results: z.array(z.object({ id: z.string(), status: z.enum(COMMAND_STATUSES) })),
});

interface ErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly target?: string | null | undefined;
  readonly details?: readonly ErrorDetail[] | null | undefined;
}

const ERROR_DETAIL: z.ZodType<ErrorDetail> = z.lazy(() =>
  z.object({
    code: z.string(),
    message: z.string(),
    target: z.string().nullish(),
    details: z.array(ERROR_DETAIL).nullish(),
  }),
);

export const ERROR_ENVELOPE = z.object({ requestId: z.string().nullish(), error: ERROR_DETAIL });

export type ErrorEnvelope = z.infer<typeof ERROR_ENVELOPE>;

export function describeErrorEnvelope(envelope: ErrorEnvelope): string {
  const reasons = (envelope.error.details ?? []).map((detail) => detail.message);
  const base = `${envelope.error.code}: ${envelope.error.message}`;
  return reasons.length === 0 ? base : `${base} (${reasons.join('; ')})`;
}

export function nextPageOf(list: { readonly _links?: z.infer<typeof LINKS> }): string | null {
  return list._links?.next?.href ?? null;
}
