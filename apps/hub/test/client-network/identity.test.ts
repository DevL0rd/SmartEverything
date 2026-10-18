import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
    await writeFile(
      join(directory, 'hub-tls-identity.json'),
      JSON.stringify({
        version: 1,
        name: 'Test hub',
        serverName: certificate.serverName,
        key: certificate.key.privateKey,
        cert: certificate.cert,
      }),
    );
    const opened = await openHubIdentity(directory);
    expect(opened.identity.tls.publicKeySha256).toBe(
      trustFor(certificate, 1).identity.tls.publicKeySha256,
    );
  });
});
