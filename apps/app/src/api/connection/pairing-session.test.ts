import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_ENDPOINTS,
  hashPairingCode,
  pairingProof,
  type HubIdentity,
  type HubPairingObservation,
} from '@smarteverything/domain';
import type { PairingTarget } from '../pairing-input';
import { PairingResponseError } from './pairing-errors';
import type { PairingHost, PairingRun } from './pairing-session';

const CODE = 'ABCD-EFGH';
const ADDRESS = 'https://192.168.1.10:8443';
const TOKEN = `set_${'a'.repeat(64)}`;
const TLS = {
  serverName: `smarteverything-${'ab'.repeat(16)}.local`,
  certificateSha256: 'cd'.repeat(32),
  publicKeySha256: 'ab'.repeat(32),
} as const;
const IDENTITY: HubIdentity = {
  id: TLS.publicKeySha256,
  protocolVersion: 1,
  name: 'Home',
  tls: TLS,
};
const CLIENT = {
  id: 'client-1',
  name: 'Pixel',
  platform: 'android',
  role: 'member',
  built_in: 0,
  profile_id: null,
  created_at: '2026-10-17T00:00:00.000Z',
  last_seen_at: null,
};
const OBSERVATION: HubPairingObservation = {
  kind: 'observed',
  requestId: 'request-1',
  generation: 7,
  url: `${ADDRESS}/`,
  address: '192.168.1.10',
  port: 8443,
  tls: TLS,
  validFrom: '2020-01-01T00:00:00.000Z',
  validTo: '2099-01-01T00:00:00.000Z',
};

const script: {
  identity: HubIdentity;
  posts: string[];
  proofStatus: number;
  hubCertificate: string;
  stored: unknown[];
  inspection: Error | null;
} = {
  identity: IDENTITY,
  posts: [],
  proofStatus: 200,
  hubCertificate: TLS.certificateSha256,
  stored: [],
  inspection: null,
};

vi.mock('expo-crypto', () => ({
  randomUUID: (): string => '01234567-89ab-cdef-0123-456789abcdef',
}));
vi.mock('../../design/platform', () => ({ appPlatform: (): string => 'android' }));
vi.mock('./route-platform', () => ({
  hubNetwork: (): { capabilities: { http: boolean } } => ({ capabilities: { http: true } }),
  pinnedFetch: vi.fn(),
}));
vi.mock('./storage', () => ({
  storeConnection: (_kind: string, connection: unknown): Promise<void> => {
    script.stored.push(connection);
    return Promise.resolve();
  },
  forgetStoredEnrollment: (): Promise<void> => Promise.resolve(),
}));
vi.mock('../../../modules/health-connect/src/hub-network', () => ({
  activateNativeServerEnrollment: (): Promise<void> => Promise.resolve(),
  clearNativeServerCredential: (): Promise<void> => Promise.resolve(),
}));
vi.mock('./pairing-inspection', () => ({
  PairingInspection: class {
    inspect(): Promise<HubPairingObservation> {
      return script.inspection === null
        ? Promise.resolve(OBSERVATION)
        : Promise.reject(script.inspection);
    }
    cancel(): Promise<void> {
      return Promise.resolve();
    }
  },
}));
vi.mock('./pairing-discovery', async () => {
  const { ValueStore } = await import('../../design/external-store');
  return {
    PairingDiscovery: class {
      readonly state = new ValueStore({
        generation: 7,
        state: 'searching',
        detail: '',
        candidates: [{ name: 'Home', url: ADDRESS }],
      });
      start = vi.fn();
      stop(): Promise<void> {
        return Promise.resolve();
      }
      candidate(url: string): unknown {
        return this.state.get().candidates.find((entry) => entry.url === url) ?? null;
      }
    },
  };
});
vi.mock('./pairing-transport', () => ({
  PairingTransport: class {
    constructor(readonly endpoint: { kind: string; url: string }) {}
    open(): Promise<void> {
      return Promise.resolve();
    }
    identityOf(): Promise<HubIdentity> {
      return Promise.resolve(script.identity);
    }
    get(path: string): Promise<unknown> {
      script.posts.push(`GET ${path}`);
      return Promise.resolve({
        identity: script.identity,
        endpoints: [this.endpoint],
        remoteAvailable: false,
        discovery: { state: 'disabled', detail: '' },
      });
    }
    post(path: string, body: { nonce?: string }): Promise<unknown> {
      script.posts.push(path);
      if (path === API_ENDPOINTS.proveHub.path) {
        if (script.proofStatus !== 200) throw new PairingResponseError(script.proofStatus);
        return Promise.resolve({
          proof: pairingProof(
            hashPairingCode(CODE),
            'hub',
            script.hubCertificate,
            body.nonce ?? '',
          ),
        });
      }
      return Promise.resolve({ token: TOKEN, client: CLIENT });
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

const { PairingSession } = await import('./pairing-session');

const run: PairingRun = {
  kind: 'phone',
  generation: 1,
  isCurrent: (): boolean => true,
  publish: vi.fn(),
};
const host: PairingHost = { begin: (): PairingRun => run, release: vi.fn() };

function problemOf(pairing: InstanceType<typeof PairingSession>): string {
  const state = pairing.state.get();
  return 'problem' in state && state.problem !== null ? state.problem : '';
}

function session(): InstanceType<typeof PairingSession> {
  return new PairingSession(host);
}

beforeEach(() => {
  script.identity = IDENTITY;
  script.posts = [];
  script.proofStatus = 200;
  script.hubCertificate = TLS.certificateSha256;
  script.stored = [];
  script.inspection = null;
  vi.mocked(run.publish).mockClear();
});

describe('pairing with a home found nearby', () => {
  it('proves the code against the inspected certificate before it claims', async () => {
    const pairing = session();
    await pairing.select(ADDRESS);
    expect(pairing.state.get()).toMatchObject({ status: 'ready', home: 'Home' });
    await pairing.submit(CODE, 'Pixel');
    expect(script.posts).toEqual(['/api/pair/proof', '/api/pair/claim', 'GET /api/connection']);
    expect(pairing.state.get()).toMatchObject({ status: 'complete' });
    expect(script.stored).toHaveLength(1);
    expect(run.publish).toHaveBeenCalledOnce();
  });

  it('keeps the chosen home when discovery ends before the code is entered', async () => {
    const pairing = session();
    await pairing.select(ADDRESS);
    pairing.discovery.state.set({ generation: 8, state: 'idle', detail: '', candidates: [] });
    await pairing.submit(CODE, 'Pixel');
    expect(pairing.state.get()).toMatchObject({ status: 'complete' });
  });

  it('refuses a hub that proves the code for another certificate and never claims', async () => {
    script.hubCertificate = 'ef'.repeat(32);
    const pairing = session();
    await pairing.select(ADDRESS);
    await pairing.submit(CODE, 'Pixel');
    expect(script.posts).toEqual(['/api/pair/proof']);
    expect(problemOf(pairing)).toContain('not the home you chose');
  });

  it('lets the person retype a code the hub does not know without choosing the home again', async () => {
    script.proofStatus = 422;
    const pairing = session();
    await pairing.select(ADDRESS);
    await pairing.submit(CODE, 'Pixel');
    expect(script.posts).toEqual(['/api/pair/proof']);
    expect(pairing.state.get().status).toBe('ready');
    expect(problemOf(pairing)).toContain('did not match this home');
  });
});

describe('pairing with a scanned code', () => {
  const target: PairingTarget = {
    url: 'https://home.example.com',
    code: CODE,
    identity: IDENTITY,
    endpoints: [{ kind: 'remote', url: 'https://home.example.com' }],
  };

  it('claims directly because the code already carries the certificate', async () => {
    const pairing = session();
    await pairing.useQr(target);
    await pairing.submit(CODE, 'Pixel');
    expect(script.posts).toEqual(['/api/pair/claim', 'GET /api/connection']);
    expect(pairing.state.get()).toMatchObject({ status: 'complete' });
  });

  it('refuses a home whose certificate differs from the scanned one', async () => {
    script.identity = { ...IDENTITY, tls: { ...TLS, certificateSha256: '12'.repeat(32) } };
    const pairing = session();
    await pairing.useQr(target);
    expect(pairing.state.get().status).toBe('choosing');
    expect(problemOf(pairing)).toContain('not the home you chose');
  });
});

describe('saying what actually went wrong', () => {
  it('tells the person a home that left the network is no longer nearby', async () => {
    const pairing = session();
    await pairing.select('https://192.168.1.99:8443');
    expect(problemOf(pairing)).toContain('no longer nearby');
  });

  it('does not call a network failure an identity mismatch', async () => {
    script.inspection = new Error('connect ETIMEDOUT');
    const pairing = session();
    await pairing.select(ADDRESS);
    expect(problemOf(pairing)).toContain('could not be reached');
    expect(problemOf(pairing)).not.toContain('not the home you chose');
  });

  it('asks for a new code when the scanned one is malformed, not for another home', async () => {
    const pairing = session();
    await pairing.useQr({
      url: 'https://elsewhere.example.com',
      code: CODE,
      identity: IDENTITY,
      endpoints: [{ kind: 'remote', url: 'https://home.example.com' }],
    });
    expect(problemOf(pairing)).toContain('cannot be used');
    expect(problemOf(pairing)).not.toContain('not the home you chose');
  });
});
