import { createHash, createPrivateKey, randomBytes, X509Certificate } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { HUB_IDENTITY, type HubIdentity } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { generate } from 'selfsigned';
import { z } from 'zod';
import { isMissing } from '../fs-util';

const log = new Logger('hub.network');

const IDENTITY_FILE = 'hub-tls-identity.json';
const KEY_BITS = 3072;
const VALID_DAYS = 3650;
const DAY_MS = 86_400_000;
const STORED_IDENTITY = z.strictObject({
  version: z.literal(1),
  name: z.string().min(1).max(63),
  serverName: z.string().regex(/^smarteverything-[0-9a-f]{32}\.local$/),
  key: z.string().min(1),
  cert: z.string().min(1),
});

type StoredIdentity = z.infer<typeof STORED_IDENTITY>;

export interface HubTlsIdentity {
  readonly identity: HubIdentity;
  readonly key: string;
  readonly cert: string;
}

export class HubIdentityError extends Error {
  override readonly name = 'HubIdentityError';

  constructor(
    readonly path: string,
    reason: string,
    override readonly cause?: unknown,
  ) {
    super(`The persistent hub TLS identity at ${path} is unusable: ${reason}.`);
  }
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function validated(path: string, stored: StoredIdentity): HubTlsIdentity {
  const certificate = new X509Certificate(stored.cert);
  if (!certificate.checkPrivateKey(createPrivateKey(stored.key))) {
    throw new HubIdentityError(path, 'the certificate and private key do not match');
  }
  if (!certificate.verify(certificate.publicKey)) {
    throw new HubIdentityError(path, 'the certificate signature is invalid');
  }
  if (certificate.checkHost(stored.serverName) === undefined) {
    throw new HubIdentityError(path, 'the certificate does not match its stable DNS name');
  }
  const publicKeySha256 = digest(certificate.publicKey.export({ type: 'spki', format: 'der' }));
  return {
    key: stored.key,
    cert: stored.cert,
    identity: HUB_IDENTITY.parse({
      id: publicKeySha256,
      protocolVersion: 1,
      name: stored.name,
      tls: {
        serverName: stored.serverName,
        publicKeySha256,
        certificateSha256: digest(certificate.raw),
      },
    }),
  };
}

async function generated(): Promise<StoredIdentity> {
  const name = hostname().slice(0, 63);
  const serverName = `smarteverything-${randomBytes(16).toString('hex')}.local`;
  const now = Date.now();
  const pair = await generate([{ name: 'commonName', value: serverName }], {
    keySize: KEY_BITS,
    algorithm: 'sha256',
    notBeforeDate: new Date(now - DAY_MS),
    notAfterDate: new Date(now + VALID_DAYS * DAY_MS),
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: serverName },
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' },
        ],
      },
    ],
  });
  return { version: 1, name, serverName, key: pair.private, cert: pair.cert };
}

export async function openHubIdentity(dataDirectory: string): Promise<HubTlsIdentity> {
  const path = join(dataDirectory, IDENTITY_FILE);
  try {
    const loaded = validated(path, STORED_IDENTITY.parse(JSON.parse(await readFile(path, 'utf8'))));
    log.info('identity.loaded', { hubId: loaded.identity.id.slice(0, 12) });
    return loaded;
  } catch (cause) {
    if (!isMissing(cause)) {
      throw new HubIdentityError(path, 'reading or validating the saved identity failed', cause);
    }
  }
  log.warn('identity.generating', { reason: 'no_saved_identity', keyBits: KEY_BITS });
  const stored = await generated();
  const identity = validated(path, stored);
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(stored), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
    log.info('identity.created', { hubId: identity.identity.id.slice(0, 12) });
  } finally {
    await rm(temporary, { force: true });
  }
  return identity;
}
