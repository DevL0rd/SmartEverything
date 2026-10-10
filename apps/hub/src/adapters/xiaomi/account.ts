import { XIAOMI_REGIONS, type ProviderProblem } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoredAccount } from '../contract';

const XIAOMI_SECRETS = z.object({
  userId: z.string().min(1),
  passToken: z.string().min(1),
  ssecurity: z.string().min(1),
  serviceToken: z.string().min(1),
  deviceId: z.string().min(1),
  region: z.enum(XIAOMI_REGIONS),
  account: z.string().min(1).optional(),
});

export type XiaomiSecrets = z.infer<typeof XIAOMI_SECRETS>;

export type SessionTokens = Pick<
  XiaomiSecrets,
  'userId' | 'passToken' | 'ssecurity' | 'serviceToken'
>;

export class XiaomiAccountError extends Error {
  override readonly name = 'XiaomiAccountError';

  constructor(readonly issues: string) {
    super(
      `The stored Xiaomi account is unusable; expected the secrets of a linked account, received ${issues}.`,
    );
  }
}

export class XiaomiSessionRejectedError extends Error {
  override readonly name = 'XiaomiSessionRejectedError';
  readonly problem: ProviderProblem = 'session_expired';

  constructor() {
    super('Xiaomi no longer accepts the stored passToken; the account has to be linked again.');
  }
}

const REGION_NAMES: Readonly<Record<XiaomiSecrets['region'], string>> = {
  cn: 'China',
  de: 'Europe',
  i2: 'India',
  ru: 'Russia',
  sg: 'Singapore',
  us: 'United States',
};

export function labelOf(secrets: XiaomiSecrets): string {
  return `${secrets.account ?? 'Xiaomi account'} · ${REGION_NAMES[secrets.region]}`;
}

export function storedAccountOf(secrets: XiaomiSecrets): StoredAccount {
  const { account, ...rest } = secrets;
  return {
    label: labelOf(secrets),
    secrets: { ...rest, ...(account === undefined ? {} : { account }) },
  };
}

export function secretsOf(account: StoredAccount): XiaomiSecrets {
  const parsed = XIAOMI_SECRETS.safeParse(account.secrets);
  if (!parsed.success) {
    throw new XiaomiAccountError(
      parsed.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  }
  return parsed.data;
}
