import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { JSON_VALUE, PROVIDER, PUSH_SERVICE_ACCOUNT, type Provider } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoredAccount } from '../adapters/contract';
import { isMissing } from '../fs-util';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const ASSOCIATED_DATA = Buffer.from('smarteverything/hub-secrets/v1');

const STORED_ACCOUNT = z.object({
  label: z.string().min(1),
  secrets: z.record(z.string(), JSON_VALUE),
});

const SMARTTHINGS_APP = z.object({
  appId: z.string().min(1).nullable().default(null),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

const AUTOMATION_SECRET_RECORD = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type AutomationSecretRecord = z.infer<typeof AUTOMATION_SECRET_RECORD>;

const HUB_SECRETS = z.object({
  accounts: z.partialRecord(PROVIDER, STORED_ACCOUNT),
  pushServiceAccount: PUSH_SERVICE_ACCOUNT.nullable(),
  smartthingsApp: SMARTTHINGS_APP.nullable().default(null),
  deviceKeys: z.record(z.string(), z.string().regex(/^[0-9a-f]{32}$/)).default({}),
  geminiKey: z.string().min(1).nullable().default(null),
  openrouterKey: z.string().min(1).nullable().default(null),
  plugins: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  automationSecrets: z.record(z.uuid(), AUTOMATION_SECRET_RECORD).optional(),
});

export type HubSecrets = z.infer<typeof HUB_SECRETS>;

const SEALED_FILE = z.object({
  version: z.literal(1),
  nonce: z.base64(),
  tag: z.base64(),
  ciphertext: z.base64(),
});

const EMPTY: HubSecrets = {
  accounts: {},
  pushServiceAccount: null,
  smartthingsApp: null,
  deviceKeys: {},
  geminiKey: null,
  openrouterKey: null,
  plugins: {},
};

export class SecretStoreError extends Error {
  override readonly name = 'SecretStoreError';

  constructor(
    readonly path: string,
    reason: string,
    override readonly cause?: unknown,
  ) {
    super(`The secret store at ${path} could not be opened: ${reason}.`);
  }
}

function encrypt(key: Buffer, secrets: HubSecrets): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(ASSOCIATED_DATA);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(secrets), 'utf8'),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SecretStoreError(path, 'the file is not JSON', error);
  }
}

function decrypt(path: string, key: Buffer, text: string): HubSecrets {
  const sealed = SEALED_FILE.safeParse(parseJson(path, text));
  if (!sealed.success) {
    throw new SecretStoreError(path, 'the file is not a sealed secret store', sealed.error);
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.data.nonce, 'base64'));
    decipher.setAAD(ASSOCIATED_DATA);
    decipher.setAuthTag(Buffer.from(sealed.data.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(sealed.data.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return HUB_SECRETS.parse(JSON.parse(plain.toString('utf8')));
  } catch (error) {
    throw new SecretStoreError(path, 'the key does not open it or its contents are invalid', error);
  }
}

export class SecretStore {
  private current: HubSecrets;
  private writing: Promise<void> = Promise.resolve();

  private constructor(
    private readonly path: string,
    private readonly key: Buffer,
    initial: HubSecrets,
  ) {
    this.current = initial;
  }

  static async open(path: string, key: Buffer): Promise<SecretStore> {
    try {
      return new SecretStore(path, key, decrypt(path, key, await readFile(path, 'utf8')));
    } catch (error) {
      if (isMissing(error)) {
        return new SecretStore(path, key, EMPTY);
      }
      throw error;
    }
  }

  read(): HubSecrets {
    return this.current;
  }

  async update(change: (secrets: HubSecrets) => HubSecrets): Promise<HubSecrets> {
    const next = HUB_SECRETS.parse(change(this.current));
    this.current = next;
    const persist = (): Promise<void> => this.persist(next);
    const write = this.writing.then(persist, persist);
    this.writing = write;
    await write;
    return next;
  }

  async saveAccount(provider: Provider, account: StoredAccount): Promise<void> {
    await this.update((secrets) => ({
      ...secrets,
      accounts: { ...secrets.accounts, [provider]: account },
    }));
  }

  async removeAccount(provider: Provider): Promise<void> {
    await this.update((secrets) => ({
      ...secrets,
      accounts: Object.fromEntries(
        Object.entries(secrets.accounts).filter(([name]) => name !== provider),
      ),
    }));
  }

  deviceKey(externalId: string): string | null {
    return this.current.deviceKeys[externalId] ?? null;
  }

  async saveDeviceKey(externalId: string, key: string): Promise<void> {
    await this.update((secrets) => ({
      ...secrets,
      deviceKeys: { ...secrets.deviceKeys, [externalId]: key },
    }));
  }

  async removeDeviceKey(externalId: string): Promise<void> {
    await this.update((secrets) => ({
      ...secrets,
      deviceKeys: Object.fromEntries(
        Object.entries(secrets.deviceKeys).filter(([name]) => name !== externalId),
      ),
    }));
  }

  async saveAutomationSecret(id: string, record: AutomationSecretRecord): Promise<void> {
    await this.update((secrets) => ({
      ...secrets,
      automationSecrets: { ...secrets.automationSecrets, [id]: record },
    }));
  }

  async removeAutomationSecret(id: string): Promise<void> {
    await this.update((secrets) => ({
      ...secrets,
      automationSecrets: Object.fromEntries(
        Object.entries(secrets.automationSecrets ?? {}).filter(([name]) => name !== id),
      ),
    }));
  }

  private async persist(secrets: HubSecrets): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temporary, encrypt(this.key, secrets), { mode: 0o600, flag: 'wx' });
    await rename(temporary, this.path);
  }
}
