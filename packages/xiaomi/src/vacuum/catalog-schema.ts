import { isStandardCapability, type StandardCapability } from '@smarteverything/domain';
import { z } from 'zod';
import { MIOT_FORMATS } from '../spec';

const STANDARD_KEY = z
  .string()
  .refine((key): key is StandardCapability => isStandardCapability(key), {
    message: 'not a standard capability key',
  });

const CAPABILITY_PROPOSAL = z.object({
  key: STANDARD_KEY,
  role: z.enum(['state', 'setting', 'command']),
  value: z.string().min(1).nullable(),
  valueMap: z.array(z.object({ value: z.number().int(), state: z.string().min(1) })),
});

const VALUE_OPTION = z.object({
  value: z.number().int(),
  spec: z.string(),
  appLabel: z.string(),
});

const WRITE_RESULT = z.object({
  accepted: z.boolean(),
  valuesTried: z.number().int().positive(),
  readBackMatches: z.boolean().nullable(),
  ackMsMax: z.number().int().nonnegative(),
  pushMs: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).nullable(),
});

const COMMON = {
  siid: z.number().int().positive(),
  name: z.string().min(1),
  label: z.string().min(1),
  service: z.string().min(1),
  vendorSpecific: z.boolean(),
  inSpec: z.boolean(),
  note: z.string().min(1).nullable(),
  destructive: z.boolean(),
  danger: z.string().min(1).nullable(),
  capability: CAPABILITY_PROPOSAL.nullable(),
  absentOnDevice: z.literal(true).optional(),
};

export const VACUUM_PROPERTY = z.object({
  kind: z.literal('property'),
  piid: z.number().int().positive(),
  ...COMMON,
  format: z.enum(MIOT_FORMATS).nullable(),
  access: z.array(z.enum(['read', 'write', 'notify'])),
  unit: z.string().min(1).nullable(),
  range: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  values: z.array(VALUE_OPTION),
  live: z.object({
    readOk: z.boolean(),
    pushed: z.boolean(),
    write: WRITE_RESULT.nullable(),
  }),
});

export const VACUUM_ACTION = z.object({
  kind: z.literal('action'),
  aiid: z.number().int().positive(),
  ...COMMON,
  inputs: z.array(z.number().int().positive()),
  outputs: z.array(z.number().int().positive()),
  live: z
    .object({
      accepted: z.boolean(),
      calls: z.number().int().positive(),
      msMax: z.number().int().nonnegative(),
      inputTried: z.string().nullable(),
      effect: z.string().min(1),
    })
    .nullable(),
});

export const VACUUM_EVENT = z.object({
  kind: z.literal('event'),
  eiid: z.number().int().positive(),
  ...COMMON,
  arguments: z.array(z.number().int().positive()),
  live: z.object({ pushed: z.boolean(), observation: z.string().min(1).nullable() }),
});

export const VACUUM_SERVICE = z.object({
  siid: z.number().int().positive(),
  name: z.string().min(1),
  label: z.string().min(1),
  inSpec: z.boolean(),
  instanceLocal: z.boolean(),
  purpose: z.string().min(1),
});

export const VACUUM_CATALOG = z.object({
  model: z.string().min(1),
  marketingName: z.string().min(1),
  retailModel: z.string().min(1),
  station: z.string().min(1),
  specUrn: z.string().min(1),
  firmware: z.string().min(1),
  researched: z.iso.date(),
  phantomServices: z.array(z.number().int().positive()),
  dangerousMethods: z.array(z.object({ method: z.string().min(1), effect: z.string().min(1) })),
  services: z.array(VACUUM_SERVICE),
  properties: z.array(VACUUM_PROPERTY),
  actions: z.array(VACUUM_ACTION),
  events: z.array(VACUUM_EVENT),
});

export const VACUUM_SAFETY = z.enum([
  'read-only',
  'safe-physical',
  'never-in-tests',
  'destructive',
]);

export const VACUUM_FAULT = z.object({
  code: z.number().int().positive(),
  type: z.enum(['error', 'alert']),
  title: z.string().min(1),
  message: z.string().min(1),
  detail: z.array(z.string().min(1)).nullable(),
  handledButton: z.boolean().nullable(),
  dockVariant: z.object({ title: z.string().min(1), message: z.string().min(1) }).nullable(),
});

export const VACUUM_FAULT_TABLE = z
  .array(VACUUM_FAULT)
  .refine((table) => new Set(table.map((fault) => fault.code)).size === table.length, {
    message: 'fault codes must be unique',
  });

export type VacuumProperty = z.infer<typeof VACUUM_PROPERTY>;
export type VacuumAction = z.infer<typeof VACUUM_ACTION>;
export type VacuumEvent = z.infer<typeof VACUUM_EVENT>;
export type VacuumService = z.infer<typeof VACUUM_SERVICE>;
export type VacuumCatalog = z.infer<typeof VACUUM_CATALOG>;
export type VacuumSafety = z.infer<typeof VACUUM_SAFETY>;
export type VacuumFault = z.infer<typeof VACUUM_FAULT>;
