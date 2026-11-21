import { ApiError, hashPairingCode, pairingProof, type HubIdentity } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HubConnections } from '../../src/network/connections';
import { OwnerAlerts } from '../../src/extensions/owner-alerts';
import { AccessService } from '../../src/server/access';
import { testStore, type TestStore } from '../support/store';

const NONCE = 'ab'.repeat(16);
const CERTIFICATE = 'cd'.repeat(32);
const IDENTITY: HubIdentity = {
  id: 'ab'.repeat(32),
  protocolVersion: 1,
  name: 'Home',
  tls: {
    serverName: `smarteverything-${'ab'.repeat(16)}.local`,
    certificateSha256: CERTIFICATE,
    publicKeySha256: 'ab'.repeat(32),
  },
};
const REMOTE = 'https://home.example.com';

let opened: TestStore;
let access: AccessService;

beforeEach(async () => {
  opened = await testStore();
  opened.store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  opened.store.settings.setPublicUrl(REMOTE);
  opened.store.settings.recordPublicUrlCheck(REMOTE, { verified: true });
  access = new AccessService({
    connections: new HubConnections({ identity: IDENTITY, key: '', cert: '' }, opened.store),
    store: opened.store,
    ownerTokenPath: opened.layout.system.keys.ownerToken,
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    clientWithdrawn: (): void => undefined,
    clientPaused: (): void => undefined,
    alerts: new OwnerAlerts(),
    scopesChanged: (): void => undefined,
  });
});

afterEach(async () => {
  await opened.close();
});

async function started(): Promise<{ readonly code: string; readonly hash: string }> {
  const owner = opened.store.clients.owner();
  if (owner === undefined) throw new Error('the owner exists');
  const pairing = await access.startPairing('member', owner.id);
  return { code: pairing.code, hash: hashPairingCode(pairing.code) };
}

function prove(proof: string): Promise<{ readonly proof: string }> {
  return access.prove({ nonce: NONCE, proof, remote: 'phone' });
}

describe('pairing QR', () => {
  it('always carries the identity and the endpoints with the url and the code', async () => {
    const owner = opened.store.clients.owner();
    if (owner === undefined) throw new Error('the owner exists');
    const pairing = await access.startPairing('owner', owner.id);
    expect(pairing.qr).toStrictEqual({
      url: REMOTE,
      code: pairing.code,
      identity: IDENTITY,
      endpoints: [{ kind: 'remote', url: REMOTE }],
    });
  });
});

describe('pairing proof', () => {
  it('answers a client that knows the code with a hub proof bound to the certificate', async () => {
    const { hash } = await started();
    expect(await prove(pairingProof(hash, 'client', CERTIFICATE, NONCE))).toStrictEqual({
      proof: pairingProof(hash, 'hub', CERTIFICATE, NONCE),
    });
  });

  it('refuses a proof made for another certificate or for another code', async () => {
    const { hash } = await started();
    for (const proof of [
      pairingProof(hash, 'client', 'ef'.repeat(32), NONCE),
      pairingProof(hashPairingCode('ABCD-2345'), 'client', CERTIFICATE, NONCE),
    ])
      await expect(prove(proof)).rejects.toThrow(ApiError);
  });

  it('keeps the code usable after a proof and refuses a proof once it is claimed', async () => {
    const { code, hash } = await started();
    const proof = pairingProof(hash, 'client', CERTIFICATE, NONCE);
    await prove(proof);
    const claimed = await access.claim({
      code,
      name: 'Pixel',
      platform: 'android',
      remote: 'phone',
    });
    expect(claimed.client.name).toBe('Pixel');
    await expect(prove(proof)).rejects.toThrow(ApiError);
  });
});
