import { createHash, createPublicKey, randomBytes, type KeyObject } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  RELEASE_FINGERPRINT,
  RELEASE_KEY_LABEL,
  RELEASE_KEY_ROLE,
  RELEASE_PUBLIC_KEY,
  type ReleaseKeyRole,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { isMissing } from '../fs-util';

const log = new Logger('hub.releases');

const ED25519_KEY_BYTES = 32;

export const TRUSTED_RELEASE_KEY = z.strictObject({
  fingerprint: RELEASE_FINGERPRINT,
  publicKey: RELEASE_PUBLIC_KEY,
  role: RELEASE_KEY_ROLE,
  label: RELEASE_KEY_LABEL,
  trustedAt: z.iso.datetime(),
});

export type TrustedReleaseKey = z.infer<typeof TRUSTED_RELEASE_KEY>;

const TRUSTED_RELEASE_KEYS = z.strictObject({ keys: z.array(TRUSTED_RELEASE_KEY) });

export interface ReleaseKeyRequest {
  readonly publicKey: string;
  readonly role: ReleaseKeyRole;
  readonly label: string;
}

export class ReleaseKeyError extends Error {
  override readonly name = 'ReleaseKeyError';
}

function rawKey(publicKey: string): Buffer {
  const raw = Buffer.from(RELEASE_PUBLIC_KEY.parse(publicKey), 'base64');
  if (raw.length !== ED25519_KEY_BYTES)
    throw new ReleaseKeyError('A release key is a 32 byte Ed25519 public key');
  return raw;
}

export function releaseKeyFingerprint(publicKey: string): string {
  return createHash('sha256').update(rawKey(publicKey)).digest('hex');
}

export function releasePublicKey(publicKey: string): KeyObject {
  try {
    return createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: rawKey(publicKey).toString('base64url') },
      format: 'jwk',
    });
  } catch (cause) {
    if (cause instanceof ReleaseKeyError) throw cause;
    throw new ReleaseKeyError('The release key is not a valid Ed25519 public key');
  }
}

export async function trustedReleaseKeys(path: string): Promise<readonly TrustedReleaseKey[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
  const { keys } = TRUSTED_RELEASE_KEYS.parse(JSON.parse(text));
  for (const key of keys)
    if (releaseKeyFingerprint(key.publicKey) !== key.fingerprint)
      throw new ReleaseKeyError(`The trusted key ${key.fingerprint} does not match its public key`);
  return keys;
}

async function writeKeys(path: string, keys: readonly TrustedReleaseKey[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify({ keys }, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, path);
  } catch (cause) {
    await rm(temporary, { force: true });
    throw cause;
  }
}

const tails = new Map<string, Promise<unknown>>();

function serialized<T>(path: string, work: () => Promise<T>): Promise<T> {
  const next = (tails.get(path) ?? Promise.resolve()).then(work);
  tails.set(path, Promise.allSettled([next]));
  return next;
}

export function trustReleaseKey(
  path: string,
  request: ReleaseKeyRequest,
  now: Date,
): Promise<TrustedReleaseKey> {
  return serialized(path, async () => {
    releasePublicKey(request.publicKey);
    const publicKey = rawKey(request.publicKey).toString('base64');
    const fingerprint = releaseKeyFingerprint(publicKey);
    const label = RELEASE_KEY_LABEL.parse(request.label);
    const keys = await trustedReleaseKeys(path);
    const existing = keys.find((key) => key.fingerprint === fingerprint);
    if (existing !== undefined) {
      if (existing.role === request.role && existing.label === label) return existing;
      throw new ReleaseKeyError(
        `The key ${fingerprint} is already trusted as ${existing.role} key "${existing.label}"; remove it first`,
      );
    }
    const key = TRUSTED_RELEASE_KEY.parse({
      fingerprint,
      publicKey,
      role: request.role,
      label,
      trustedAt: now.toISOString(),
    });
    await writeKeys(path, [...keys, key]);
    log.info('release_key.trusted', { fingerprint, role: key.role });
    return key;
  });
}

export function removeReleaseKey(path: string, fingerprint: string): Promise<TrustedReleaseKey> {
  return serialized(path, async () => {
    const keys = await trustedReleaseKeys(path);
    const removed = keys.find((key) => key.fingerprint === fingerprint);
    if (removed === undefined)
      throw new ReleaseKeyError(`No trusted release key has the fingerprint ${fingerprint}`);
    await writeKeys(
      path,
      keys.filter((key) => key !== removed),
    );
    log.info('release_key.removed', { fingerprint, role: removed.role });
    return removed;
  });
}
