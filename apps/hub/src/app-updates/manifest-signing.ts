import type { Logger } from '@smarteverything/logging';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMissing } from '../fs-util';

export const SIGNING_KEY_ID = 'main';

export class AppUpdateSigningUnavailableError extends Error {
  override readonly name = 'AppUpdateSigningUnavailableError';

  constructor(expected: string, received: string) {
    super(`Signing an app update needs ${expected}; received ${received}`);
  }
}

type Signing =
  | { readonly kind: 'ready'; readonly key: KeyObject }
  | { readonly kind: 'unavailable'; readonly file: string; readonly reason: string };

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function parsedKey(file: string, pem: string): Signing {
  try {
    const key = createPrivateKey(pem);
    return key.asymmetricKeyType === 'rsa'
      ? { kind: 'ready', key }
      : {
          kind: 'unavailable',
          file,
          reason: `a ${key.asymmetricKeyType ?? 'unknown'} key instead of an RSA key`,
        };
  } catch (cause) {
    return {
      kind: 'unavailable',
      file,
      reason: `a file that is not a private key (${describe(cause)})`,
    };
  }
}

async function load(file: string): Promise<Signing> {
  try {
    return parsedKey(file, await readFile(file, 'utf8'));
  } catch (cause) {
    return {
      kind: 'unavailable',
      file,
      reason: isMissing(cause) ? 'no file' : `an unreadable file (${describe(cause)})`,
    };
  }
}

export class ManifestSigner {
  private constructor(private readonly signing: Signing) {}

  static async start(directory: string, log: Logger): Promise<ManifestSigner> {
    const signing = await load(join(directory, 'keys', 'private-key.pem'));
    if (signing.kind === 'unavailable') {
      log.warn('app_update.signing_unavailable', { file: signing.file, reason: signing.reason });
    }
    return new ManifestSigner(signing);
  }

  signatureHeader(body: string): string {
    if (this.signing.kind === 'unavailable') {
      throw new AppUpdateSigningUnavailableError(
        `a RSA private key in ${this.signing.file}`,
        this.signing.reason,
      );
    }
    const signature = sign('sha256', Buffer.from(body, 'utf8'), this.signing.key);
    return `sig="${signature.toString('base64')}", keyid="${SIGNING_KEY_ID}"`;
  }
}
