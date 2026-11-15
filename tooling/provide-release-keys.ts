import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import {
  RELEASE_SIGNATURE,
  RELEASE_SIGNATURE_ALGORITHM,
  type ReleaseSignature,
} from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { releaseKeyFingerprint } from '../apps/hub/src/releases/trust.ts';

export const RELEASE_KEY_FILE = 'machine.key';
export const SIGNING_KEY_ENV = 'RELEASE_SIGNING_KEY';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const GROUP_AND_OTHER = 0o077;

export class ReleaseKeyFileError extends Error {
  override readonly name = 'ReleaseKeyFileError';
}

export interface KeyIdentity {
  readonly publicKey: string;
  readonly fingerprint: string;
}

export function releaseKeyDirectory(): string {
  const base = env['XDG_CONFIG_HOME'];
  return join(
    base !== undefined && base !== '' ? base : join(homedir(), '.config'),
    'SmartEverything-Release',
  );
}

export function identityOf(key: KeyObject): KeyIdentity {
  const jwk = createPublicKey(key).export({ format: 'jwk' });
  if (jwk.x === undefined) throw new ReleaseKeyFileError('The release key has no public part');
  const publicKey = Buffer.from(jwk.x, 'base64url').toString('base64');
  return { publicKey, fingerprint: releaseKeyFingerprint(publicKey) };
}

function privateKeyOf(pem: string, shown: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch (cause) {
    throw new ReleaseKeyFileError(`${shown} does not hold a private key: ${messageOf(cause)}`);
  }
  if (key.asymmetricKeyType !== 'ed25519')
    throw new ReleaseKeyFileError(`${shown} must hold an Ed25519 private key`);
  return key;
}

export function readKeyFile(file: string): KeyObject {
  const stats = statSync(file, { throwIfNoEntry: false });
  if (stats === undefined)
    throw new ReleaseKeyFileError(
      `${file} does not exist; run provide-release.ts --init-key to make the machine key`,
    );
  if ((stats.mode & GROUP_AND_OTHER) !== 0)
    throw new ReleaseKeyFileError(
      `${file} must not be readable by anyone but its owner (mode 0600)`,
    );
  return privateKeyOf(readFileSync(file, 'utf8'), file);
}

export function loadSigningKey(directory: string = releaseKeyDirectory()): KeyObject {
  const fromEnvironment = env[SIGNING_KEY_ENV];
  if (fromEnvironment !== undefined && fromEnvironment !== '')
    return privateKeyOf(fromEnvironment, SIGNING_KEY_ENV);
  return readKeyFile(join(directory, RELEASE_KEY_FILE));
}

export function initReleaseKey(directory: string = releaseKeyDirectory()): {
  readonly identity: KeyIdentity;
  readonly created: boolean;
} {
  const file = join(directory, RELEASE_KEY_FILE);
  if (statSync(file, { throwIfNoEntry: false }) !== undefined)
    return { identity: identityOf(readKeyFile(file)), created: false };
  mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
  chmodSync(directory, DIRECTORY_MODE);
  const { privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    flag: 'wx',
    mode: FILE_MODE,
  });
  return { identity: identityOf(privateKey), created: true };
}

export function signatureOf(manifestBytes: Buffer, key: KeyObject): ReleaseSignature {
  return RELEASE_SIGNATURE.parse({
    algorithm: RELEASE_SIGNATURE_ALGORITHM,
    fingerprint: identityOf(key).fingerprint,
    signature: sign(null, manifestBytes, key).toString('base64'),
  });
}
