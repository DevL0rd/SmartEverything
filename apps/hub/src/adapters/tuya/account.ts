import { TUYA_REGIONS, type TUYA_PROJECT_CREDENTIALS } from '@smarteverything/domain';
import type { SmartLifeSession } from '@smarteverything/tuya';
import { z } from 'zod';
import type { StoredAccount } from '../contract';

const PROJECT_SECRETS = z.object({
  method: z.literal('developer_project'),
  accessId: z.string().min(1),
  accessSecret: z.string().min(1),
  region: z.enum(TUYA_REGIONS),
  appUserId: z.string().min(1),
});

const SMART_LIFE_SECRETS = z.object({
  method: z.literal('smart_life'),
  userCode: z.string().min(1),
  terminalId: z.string().min(1),
  endpoint: z.url(),
  uid: z.string().min(1),
  username: z.string().nullable(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().int(),
});

const TUYA_SECRETS = z.discriminatedUnion('method', [PROJECT_SECRETS, SMART_LIFE_SECRETS]);

export type TuyaProjectSecrets = z.output<typeof PROJECT_SECRETS>;

export type TuyaSecrets = z.output<typeof TUYA_SECRETS>;

export function projectSecretsFrom(
  credentials: z.output<typeof TUYA_PROJECT_CREDENTIALS>,
): TuyaProjectSecrets {
  return {
    method: 'developer_project',
    accessId: credentials.accessId,
    accessSecret: credentials.accessSecret,
    region: credentials.region,
    appUserId: credentials.appUserId,
  };
}

function devices(count: number): string {
  return `${String(count)} ${count === 1 ? 'device' : 'devices'}`;
}

export function projectAccount(secrets: TuyaProjectSecrets, deviceCount: number): StoredAccount {
  return {
    label: `Developer project · ${secrets.region.toUpperCase()} · ${devices(deviceCount)}`,
    secrets: { ...secrets },
  };
}

const GENERATED_USERNAME = /^[a-z]{2,3}-\d{6,}$/;

function smartLifeLabel(username: string | null): string {
  return username === null || GENERATED_USERNAME.test(username) ? 'Smart Life account' : username;
}

export function smartLifeAccount(session: SmartLifeSession): StoredAccount {
  return {
    label: smartLifeLabel(session.username),
    secrets: { method: 'smart_life', ...session },
  };
}

export function secretsOf(account: StoredAccount): TuyaSecrets {
  return TUYA_SECRETS.parse(account.secrets);
}

export function labelOf(secrets: TuyaSecrets): string {
  return secrets.method === 'smart_life'
    ? smartLifeLabel(secrets.username)
    : `Developer project · ${secrets.region.toUpperCase()}`;
}
