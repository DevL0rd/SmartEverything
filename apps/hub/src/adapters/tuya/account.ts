import type { SmartLifeSession } from '@smarteverything/tuya';
import { z } from 'zod';
import { ProviderProblemError, type StoredAccount } from '../contract';

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

export type TuyaSecrets = z.output<typeof SMART_LIFE_SECRETS>;

export class StoredTuyaAccountUnreadableError extends Error {
  override readonly name = 'StoredTuyaAccountUnreadableError';

  constructor(readonly problems: string) {
    super(
      `The Tuya account stored on this hub is not a Smart Life sign-in, so scan a new code to link it again: ${problems}`,
    );
  }
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
  const parsed = SMART_LIFE_SECRETS.safeParse(account.secrets);
  if (!parsed.success) {
    throw new ProviderProblemError(
      'session_expired',
      new StoredTuyaAccountUnreadableError(z.prettifyError(parsed.error)),
    );
  }
  return parsed.data;
}

export function storedUserCode(account: StoredAccount | undefined): string | null {
  const parsed = SMART_LIFE_SECRETS.safeParse(account?.secrets);
  return parsed.success ? parsed.data.userCode : null;
}

export function labelOf(secrets: TuyaSecrets): string {
  return smartLifeLabel(secrets.username);
}
