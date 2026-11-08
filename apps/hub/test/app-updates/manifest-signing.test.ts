import { generateKeyPairSync, verify, type KeyObject } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AppUpdateSigningUnavailableError,
  ManifestSigner,
} from '../../src/app-updates/manifest-signing';
import { captureLogs, testLogger } from '../support/logs';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-signing-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function keyFile(content: string): Promise<void> {
  await mkdir(join(directory, 'keys'), { recursive: true });
  await writeFile(join(directory, 'keys', 'private-key.pem'), content);
}

function signatureOf(header: string): { readonly sig: Buffer; readonly keyid: string } {
  const match = /^sig="([^"]+)", keyid="([^"]+)"$/u.exec(header);
  return { sig: Buffer.from(match?.[1] ?? '', 'base64'), keyid: match?.[2] ?? '' };
}

describe('signing the manifest part', () => {
  it('signs the exact body so the public key verifies it as expo-updates does', async () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await keyFile(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const signer = await ManifestSigner.start(directory, testLogger('app-updates'));
    const body = '{"id":"é","assets":[]}';
    const { sig, keyid } = signatureOf(signer.signatureHeader(body));
    const publicKey: KeyObject = pair.publicKey;
    expect(keyid).toBe('main');
    expect(verify('sha256', Buffer.from(body, 'utf8'), publicKey, sig)).toBe(true);
    expect(verify('sha256', Buffer.from(`${body} `, 'utf8'), publicKey, sig)).toBe(false);
  });

  it('logs once when the key is missing and refuses to sign with a named error', async () => {
    const logs = captureLogs();
    const signer = await ManifestSigner.start(directory, testLogger('app-updates'));
    expect(
      logs.events().filter((event) => event === 'app_update.signing_unavailable'),
    ).toHaveLength(1);
    expect(() => signer.signatureHeader('{}')).toThrow(AppUpdateSigningUnavailableError);
    expect(() => signer.signatureHeader('{}')).toThrow(/private-key\.pem; received no file/u);
    expect(JSON.stringify(logs.records)).not.toContain('PRIVATE');
  });

  it('treats a file that is not an RSA private key as unavailable and says why', async () => {
    const logs = captureLogs();
    await keyFile('not a key');
    const broken = await ManifestSigner.start(directory, testLogger('app-updates'));
    expect(() => broken.signatureHeader('{}')).toThrow(/not a private key/u);
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    await keyFile(ec.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const wrong = await ManifestSigner.start(directory, testLogger('app-updates'));
    expect(() => wrong.signatureHeader('{}')).toThrow(/ec key instead of an RSA key/u);
    expect(
      logs.events().filter((event) => event === 'app_update.signing_unavailable'),
    ).toHaveLength(2);
  });
});
