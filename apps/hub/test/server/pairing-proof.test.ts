import { ApiError, hashPairingCode, pairingProof, type HubIdentity } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HubConnections } from '../../src/network/connections';
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
    dataDirectory: opened.directory,
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    clientWithdrawn: (): void => undefined,
    clientPaused: (): void => undefined,
  });
});

afterEach(async () => {
  await opened.close();
});

function started(): { readonly code: string; readonly hash: string } {
  const owner = opened.store.clients.owner();
  if (owner === undefined) throw new Error('the owner exists');
  const pairing = access.startPairing('member', owner.id);
  return { code: pairing.code, hash: hashPairingCode(pairing.code) };
}

function prove(proof: string): { readonly proof: string } {
  return access.prove({ nonce: NONCE, proof, remote: 'phone' });
}

describe('pairing QR', () => {
  it('always carries the identity and the endpoints with the url and the code', () => {
    const owner = opened.store.clients.owner();
    if (owner === undefined) throw new Error('the owner exists');
    const pairing = access.startPairing('owner', owner.id);
    expect(pairing.qr).toStrictEqual({
      url: REMOTE,
      code: pairing.code,
      identity: IDENTITY,
      endpoints: [{ kind: 'remote', url: REMOTE }],
    });
  });
});

describe('pairing proof', () => {
  it('answers a client that knows the code with a hub proof bound to the certificate', () => {
    const { hash } = started();
    expect(prove(pairingProof(hash, 'client', CERTIFICATE, NONCE))).toStrictEqual({
      proof: pairingProof(hash, 'hub', CERTIFICATE, NONCE),
    });
  });

  it('refuses a proof made for another certificate or for another code', () => {
    const { hash } = started();
    for (const proof of [
      pairingProof(hash, 'client', 'ef'.repeat(32), NONCE),
      pairingProof(hashPairingCode('ABCD-2345'), 'client', CERTIFICATE, NONCE),
    ])
      expect(() => prove(proof)).toThrow(ApiError);
  });

  it('keeps the code usable after a proof and refuses a proof once it is claimed', () => {
    const { code, hash } = started();
    const proof = pairingProof(hash, 'client', CERTIFICATE, NONCE);
    prove(proof);
    expect(
      access.claim({ code, name: 'Pixel', platform: 'android', remote: 'phone' }).client.name,
    ).toBe('Pixel');
    expect(() => prove(proof)).toThrow(ApiError);
  });
});
