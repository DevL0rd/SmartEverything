import { describe, expect, it, vi } from 'vitest';
import type { HubPairingObservation } from '@smarteverything/domain';
import { PairingIdentityError } from './pairing-errors';

const TLS = {
  serverName: `smarteverything-${'ab'.repeat(16)}.local`,
  certificateSha256: 'cd'.repeat(32),
  publicKeySha256: 'ab'.repeat(32),
} as const;
const URL_OF_HOME = 'https://192.168.1.10:8443';

const answer: { current: HubPairingObservation } = { current: observation() };

function observation(expired = false): HubPairingObservation {
  return {
    kind: 'observed',
    requestId: 'native-request',
    generation: 99,
    url: URL_OF_HOME,
    address: '192.168.1.10',
    port: 8443,
    tls: TLS,
    validFrom: expired ? '2000-01-01T00:00:00.000Z' : '2020-01-01T00:00:00.000Z',
    validTo: expired ? '2001-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z',
  };
}

vi.mock('expo-crypto', () => ({
  randomUUID: (): string => '01234567-89ab-cdef-0123-456789abcdef',
}));
vi.mock('./route-platform', () => ({
  hubNetwork: (): { inspectCandidate: () => Promise<HubPairingObservation> } => ({
    inspectCandidate: () => Promise.resolve(answer.current),
  }),
}));

const { PairingInspection } = await import('./pairing-inspection');

describe('inspecting a home found nearby', () => {
  it('trusts the key the home shows, not the dates or ids of a self-signed certificate', async () => {
    answer.current = observation(true);
    const seen = await new PairingInspection().inspect({ name: 'Home', url: URL_OF_HOME }, 1);
    expect(seen.tls.publicKeySha256).toBe(TLS.publicKeySha256);
  });

  it('refuses a home whose advertised id is not the key it shows', async () => {
    answer.current = observation();
    await expect(
      new PairingInspection().inspect(
        { name: 'Home', url: URL_OF_HOME, hubId: 'ef'.repeat(32) },
        1,
      ),
    ).rejects.toThrow(PairingIdentityError);
  });
});
