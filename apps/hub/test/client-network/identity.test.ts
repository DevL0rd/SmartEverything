import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hubLayout } from '../../src/data-layout';
import { openHubIdentity } from '../../src/network/identity';
import { issueCertificate, newKey, newServerName, trustFor } from '../support/pinned-hub';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe('persistent hub TLS identity', () => {
  it('starts with a saved certificate whose dates have passed, keeping the paired key', async () => {
    const certificate = await issueCertificate(newKey(), newServerName(), {
      from: Date.now() - 5 * 86_400_000,
      to: Date.now() - 86_400_000,
    });
    const directory = await mkdtemp(join(tmpdir(), 'hub-identity-'));
    directories.push(directory);
    const { tlsIdentity } = hubLayout(directory, {}).system.keys;
    await mkdir(dirname(tlsIdentity), { recursive: true });
    await writeFile(
      tlsIdentity,
      JSON.stringify({
        version: 1,
        name: 'Test hub',
        serverName: certificate.serverName,
        key: certificate.key.privateKey,
        cert: certificate.cert,
      }),
    );
    const opened = await openHubIdentity(tlsIdentity);
    expect(opened.identity.tls.publicKeySha256).toBe(
      trustFor(certificate, 1).identity.tls.publicKeySha256,
    );
  });

  it('creates a missing identity at the layout path and reopens the same one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hub-identity-'));
    directories.push(directory);
    const { tlsIdentity } = hubLayout(directory, {}).system.keys;
    const created = await openHubIdentity(tlsIdentity);
    expect(JSON.parse(await readFile(tlsIdentity, 'utf8'))).toMatchObject({ version: 1 });
    expect((await openHubIdentity(tlsIdentity)).identity.id).toBe(created.identity.id);
  }, 60_000);
});
