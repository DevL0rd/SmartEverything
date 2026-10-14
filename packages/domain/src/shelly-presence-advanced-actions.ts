import { z } from 'zod';
export const SHELLY_SCRIPT_EXAMPLE = z.object({
  fname: z
    .string()
    .min(1)
    .max(300)
    .regex(/^[a-zA-Z0-9_./-]+\.js$/)
    .refine((name) => !name.startsWith('/') && !name.split('/').includes('..')),
  title: z.string().max(300),
  description: z.string().max(3000).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
});
export const SHELLY_SCRIPT_LIBRARY = z.array(SHELLY_SCRIPT_EXAMPLE).max(512);
export const SHELLY_ADVANCED_ACTIONS = [
  z.strictObject({ action: z.literal('script_library') }),
  z.strictObject({ action: z.literal('script_example'), fname: SHELLY_SCRIPT_EXAMPLE.shape.fname }),
  z.strictObject({
    action: z.literal('firmware_upload_start'),
    size: z.int().min(1).max(16777216),
  }),
  z.strictObject({
    action: z.literal('firmware_upload_write'),
    offset: z.int().nonnegative().max(16777216),
    data: z
      .string()
      .min(4)
      .max(2732)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  }),
  z.strictObject({ action: z.literal('firmware_upload_abort') }),
  z.strictObject({ action: z.literal('firmware_alternatives') }),
  z.strictObject({ action: z.literal('firmware_switch'), name: z.string().min(1).max(80) }),
  z.strictObject({
    action: z.literal('firmware_install_alternative'),
    app: z.string().min(1).max(80),
    stage: z.enum(['stable', 'beta']),
  }),
  z.strictObject({ action: z.literal('virtual_toggle'), id: z.int().min(200).max(299) }),
  z.strictObject({ action: z.literal('kvs_get'), key: z.string().min(1).max(42) }),
  z.strictObject({
    action: z.literal('kvs_list'),
    match: z.string().max(42).optional(),
    offset: z.int().nonnegative().optional(),
  }),
  z.strictObject({
    action: z.literal('kvs_many'),
    match: z.string().max(42).optional(),
    offset: z.int().nonnegative().optional(),
  }),
  z.strictObject({ action: z.literal('device_log_files') }),
  z.strictObject({
    action: z.literal('device_log_file'),
    path: z.string().min(1).max(300).startsWith('/debug/'),
  }),
] as const;
