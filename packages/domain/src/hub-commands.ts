import { z } from 'zod';
import { MOMENT } from './api/primitives';
import { PROVIDER } from './devices';
import { MAC_ADDRESS } from './mac-address';

export const XIAOMI_REGIONS = ['cn', 'de', 'i2', 'ru', 'sg', 'us'] as const;

export const TUYA_REGIONS = ['cn', 'us', 'us-e', 'eu', 'eu-w', 'in', 'sg'] as const;

export const XIAOMI_CREDENTIALS = z.object({
  provider: z.literal('xiaomi'),
  username: z.string().min(1),
  password: z.string().min(1),
  region: z.enum(XIAOMI_REGIONS),
});

export const TUYA_LINK_METHODS = ['smart_life', 'developer_project'] as const;

export type TuyaLinkMethod = (typeof TUYA_LINK_METHODS)[number];

export const TUYA_SMART_LIFE_CREDENTIALS = z.object({
  provider: z.literal('tuya'),
  method: z.literal('smart_life'),
  userCode: z.string().trim().min(1),
});

export const TUYA_PROJECT_CREDENTIALS = z.object({
  provider: z.literal('tuya'),
  method: z.literal('developer_project'),
  accessId: z.string().min(1),
  accessSecret: z.string().min(1),
  region: z.enum(TUYA_REGIONS),
  appUserId: z.string().min(1),
});

export const TUYA_CREDENTIALS = z.discriminatedUnion('method', [
  TUYA_SMART_LIFE_CREDENTIALS,
  TUYA_PROJECT_CREDENTIALS,
]);

export const SMARTTHINGS_CREDENTIALS = z.object({
  provider: z.literal('smartthings'),
  code: z.string().min(1),
  redirectUri: z.url(),
});

export const SAMSUNG_TV_CREDENTIALS = z.object({
  provider: z.literal('samsung_tv'),
  host: z.string().min(1),
  macAddress: MAC_ADDRESS,
  name: z.string().min(1),
  attachTo: z.uuid().optional(),
});

export const PROVIDER_CREDENTIALS = z.discriminatedUnion('provider', [
  XIAOMI_CREDENTIALS,
  TUYA_CREDENTIALS,
  SMARTTHINGS_CREDENTIALS,
  SAMSUNG_TV_CREDENTIALS,
]);

export type ProviderCredentials = z.infer<typeof PROVIDER_CREDENTIALS>;

export const HUB_COMMAND = z.discriminatedUnion('capability', [
  z.object({
    capability: z.literal('hub:unlink_provider'),
    value: z.object({ provider: PROVIDER }),
  }),
  z.object({
    capability: z.literal('hub:discover'),
    value: z.object({ provider: PROVIDER.nullable() }),
  }),
  z.object({
    capability: z.literal('hub:record_clip'),
    value: z.object({ deviceId: z.uuid(), seconds: z.int().min(5).max(300) }),
  }),
]);

export type ProviderHubCommand = Exclude<HubCommand, { capability: 'hub:record_clip' }>;

export type HubCommand = z.infer<typeof HUB_COMMAND>;

export function isHubCapability(capability: string): boolean {
  return capability.startsWith('hub:');
}

export const PROVIDER_PROMPT = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('captcha'), image: z.string().startsWith('data:image/') }),
  z.object({ kind: z.literal('verification_code'), destination: z.string().min(1) }),
  z.object({ kind: z.literal('accept_on_device'), device: z.string().min(1) }),
  z.object({ kind: z.literal('authorize'), url: z.url() }),
  z.object({
    kind: z.literal('scan_qr'),
    app: z.string().min(1),
    content: z.string().min(1),
    expiresAt: MOMENT,
  }),
]);

export type ProviderPrompt = z.infer<typeof PROVIDER_PROMPT>;
