import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
let activation: Promise<unknown> = Promise.resolve();
const ticket = (generation: number): string =>
  JSON.stringify({
    canonicalOrigin: 'https://hub.example.com',
    principalId: 'a'.repeat(64),
    generation,
  });

const native = {
  activateServerEnrollment: (canonical: string, principal: string): Promise<unknown> => {
    calls.push(`activate ${canonical} ${principal.slice(0, 8)}`);
    return activation.then(() => ticket(2));
  },
  captureServerEnrollment: (canonical: string, principal: string): Promise<unknown> => {
    calls.push(`capture ${canonical} ${principal.slice(0, 8)}`);
    return Promise.resolve(ticket(2));
  },
  configureRoutes: (json: string, enrollment: string): Promise<unknown> => {
    calls.push(`configure ${enrollment}`);
    return Promise.resolve({ json });
  },
  clearServerCredential: (principal: string): Promise<void> => {
    calls.push(`clear ${principal.slice(0, 8)}`);
    return Promise.resolve();
  },
  clearRoutes: (): Promise<void> => Promise.resolve(),
  refreshRoutes: (): Promise<unknown> => Promise.resolve({}),
  routeState: (): Promise<unknown> => Promise.resolve({}),
};

vi.mock('expo', () => ({
  requireOptionalNativeModule: (): typeof native => native,
}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: (_algorithm: string, value: string): Promise<string> =>
    Promise.resolve(createHash('sha256').update(value).digest('hex')),
}));

const { activateNativeServerEnrollment, clearNativeServerCredential, withNativeEnrollment } =
  await import('../../../modules/health-connect/src/hub-network');

const URL_OF_HUB = 'https://hub.example.com/api';
const principalOf = (token: string): string =>
  createHash('sha256').update(token).digest('hex').slice(0, 8);

beforeEach(() => {
  calls.length = 0;
  activation = Promise.resolve();
});

describe('native server enrollment', () => {
  it('runs an activation before a later clear even when the activation is slow', async () => {
    let finish: () => void = () => undefined;
    activation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const activated = activateNativeServerEnrollment(URL_OF_HUB, 'token', {
      isCurrent: () => true,
    });
    const cleared = clearNativeServerCredential('token');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls.map((call) => call.split(' ')[0])).toEqual(['activate']);
    finish();
    await Promise.all([activated, cleared]);
    expect(calls.map((call) => call.split(' ')[0])).toEqual(['activate', 'clear']);
  });

  it('skips an activation that went stale before it reached the front of the queue', async () => {
    let current = true;
    const first = activateNativeServerEnrollment(URL_OF_HUB, 'token', { isCurrent: () => true });
    const stale = activateNativeServerEnrollment(URL_OF_HUB, 'token', { isCurrent: () => current });
    current = false;
    const cleared = clearNativeServerCredential('token');
    await Promise.all([first, stale, cleared]);
    expect(calls.map((call) => call.split(' ')[0])).toEqual(['activate', 'clear']);
  });

  it('hands the captured ticket to the native call and rejects a malformed ticket', async () => {
    const seen: string[] = [];
    await withNativeEnrollment(URL_OF_HUB, 'token', (enrollment) => {
      seen.push(enrollment);
      return Promise.resolve();
    });
    expect(seen).toEqual([ticket(2)]);
    expect(calls).toEqual([`capture https://hub.example.com ${principalOf('token')}`]);
    native.captureServerEnrollment = (): Promise<unknown> => Promise.resolve('{"generation":-1}');
    await expect(
      withNativeEnrollment(URL_OF_HUB, 'token', () => Promise.resolve()),
    ).rejects.toThrow();
  });
});
