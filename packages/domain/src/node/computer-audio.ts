import { z } from 'zod';

export const AUDIO_KINDS = ['output', 'input'] as const;

export type AudioKind = (typeof AUDIO_KINDS)[number];

export const AUDIO_VOLUME = z.number().min(0).max(150);

export const AUDIO_DEVICE_KINDS = [
  'speakers',
  'headphones',
  'headset',
  'microphone',
  'hdmi',
  'bluetooth',
  'usb',
  'other',
] as const;

export const AUDIO_DEVICE = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(AUDIO_DEVICE_KINDS),
  isDefault: z.boolean(),
  available: z.boolean(),
  volume: AUDIO_VOLUME,
  muted: z.boolean(),
  maxVolume: z.number().min(100).max(150),
  batteryPercent: z.number().min(0).max(100).nullable(),
  usedBy: z.array(z.string().min(1)),
});

export type AudioDevice = z.infer<typeof AUDIO_DEVICE>;

export const AUDIO_APP = z.strictObject({
  streamId: z.string().min(1),
  app: z.string().min(1),
  icon: z.string().min(1).nullable(),
  volume: AUDIO_VOLUME,
  muted: z.boolean(),
  outputId: z.string().min(1).nullable(),
});

export type AudioApp = z.infer<typeof AUDIO_APP>;

export const AUDIO_STATE = z.strictObject({
  outputs: z.array(AUDIO_DEVICE),
  inputs: z.array(AUDIO_DEVICE),
  apps: z.array(AUDIO_APP),
});

export type AudioState = z.infer<typeof AUDIO_STATE>;

const DEVICE = z.string().trim().min(1).describe('A device id from computer_read, or its name');
const KIND = z.enum(AUDIO_KINDS).default('output');
const APP = z.string().trim().min(1).describe('A streamId from computer_read, or the app name');

export const AUDIO_CHANGE = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('volume'),
    level: AUDIO_VOLUME,
    kind: KIND,
    device: DEVICE.optional(),
  }),
  z.strictObject({
    action: z.literal('mute'),
    muted: z.boolean(),
    kind: KIND,
    device: DEVICE.optional(),
  }),
  z.strictObject({ action: z.literal('default'), kind: z.enum(AUDIO_KINDS), device: DEVICE }),
  z.strictObject({ action: z.literal('app_volume'), app: APP, level: AUDIO_VOLUME }),
  z.strictObject({ action: z.literal('app_mute'), app: APP, muted: z.boolean() }),
  z.strictObject({ action: z.literal('app_output'), app: APP, output: DEVICE }),
]);

export type AudioChange = z.infer<typeof AUDIO_CHANGE>;

export type AudioChangeInput = z.input<typeof AUDIO_CHANGE>;

export const AUDIO_ACTIONS = AUDIO_CHANGE.options.map((option) => option.shape.action.value);
