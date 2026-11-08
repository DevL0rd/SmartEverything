import { expect, it, vi } from 'vitest';
import type { ServerConnection } from '../../../api/connection/storage';

const env = vi.hoisted(() => ({
  active: { url: 'https://replacement.invalid', token: 'replacement-token' },
  fetched: vi.fn<(url: string, init: RequestInit) => Promise<Response>>(),
  binary: vi.fn<(...args: unknown[]) => Promise<Response>>(),
  routed: vi.fn(),
}));
interface FakeLease {
  readonly baseUrl: string;
  readonly fetch: typeof env.fetched;
  failed(): void;
}
interface FakeRoute {
  ready(): Promise<void>;
  lease(): FakeLease;
}
vi.mock('../../../api/connection/active-route', () => ({
  assertHubLease: (): void => undefined,
  routeFor: (connection: ServerConnection): FakeRoute => {
    env.routed(connection);
    return {
      ready: (): Promise<void> => Promise.resolve(),
      lease: (): FakeLease => ({
        baseUrl: connection.url,
        fetch: env.fetched,
        failed: (): void => undefined,
      }),
    };
  },
}));
vi.mock('../../../api/connection/connection', () => ({
  connectionState: {
    get: (): { status: 'paired'; connection: ServerConnection } => ({
      status: 'paired',
      connection: env.active,
    }),
  },
  connectionRefused: (): void => undefined,
}));
vi.mock('../../../api/connection/binary-upload', () => ({ sendUpload: env.binary }));
const { connectionUploadTransport } = await import('./hub-transport');

it('retains captured credentials and sends HEAD and binary PATCH through the same lease', async () => {
  const captured = { url: 'https://captured.invalid', token: 'captured-token' };
  const transport = connectionUploadTransport(captured);
  env.fetched.mockResolvedValue(
    new Response(null, { status: 204, headers: { 'upload-offset': '0' } }),
  );
  env.binary.mockResolvedValue(new Response(null, { status: 204 }));
  const signal = new AbortController().signal;
  await transport.send({
    method: 'HEAD',
    path: '/drive/uploads/session',
    headers: {},
    body: null,
    signal,
  });
  const body = new Blob(['bounded chunk']);
  await transport.send({
    method: 'PATCH',
    path: '/drive/uploads/session',
    headers: {},
    body,
    signal,
  });
  expect(env.routed.mock.calls).toEqual([[captured]]);
  expect(env.fetched).toHaveBeenCalledWith(
    'https://captured.invalid/drive/uploads/session',
    expect.objectContaining({
      method: 'HEAD',
      headers: { authorization: 'Bearer captured-token' },
    }),
  );
  expect(env.binary).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      method: 'PATCH',
      body,
      headers: { authorization: 'Bearer captured-token' },
    }),
  );
});
