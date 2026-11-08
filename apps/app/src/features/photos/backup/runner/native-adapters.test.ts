import { beforeEach, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  available: true,
  stat: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  hash: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  prepare: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  listener: (value: unknown): void => {
    void value;
  },
}));
vi.mock('expo', () => ({
  requireOptionalNativeModule: (): object | null =>
    fake.available
      ? {
          statMedia: fake.stat,
          hashFile: fake.hash,
          prepare: fake.prepare,
          cancel: fake.cancel,
          charging: (): Promise<boolean> => Promise.resolve(true),
          addListener: (_event: string, listener: (value: unknown) => void): { remove(): void } => {
            fake.listener = listener;
            return { remove: fake.remove };
          },
        }
      : null,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('../../../nas/uploads/client', () => ({ UPLOAD_CHUNK_BYTES: 4 * 1024 * 1024 }));
vi.mock('../../../nas/uploads/hub-transport', () => ({
  connectionUploadTransport: (): object => ({}),
}));
vi.mock('../../../nas/uploads/run', () => ({ runUpload: vi.fn() }));
const adapters = await import('./native-adapters');

beforeEach(() => {
  vi.clearAllMocks();
});

it('validates native metadata without fetching media bytes', async () => {
  const stat = {
    id: 'content://media/1',
    bytes: 12 * 1024 ** 3,
    mimeType: 'video/mp4',
    relativePath: 'DCIM/',
    dateAddedSeconds: 1,
    modifiedSeconds: 2,
    isTrashed: false,
    isPending: false,
  };
  fake.stat.mockResolvedValue([stat]);
  expect(await adapters.createNativeMediaPort().statMedia([stat.id])).toEqual([stat]);
  expect(fake.hash).not.toHaveBeenCalled();
  fake.stat.mockResolvedValue([{ ...stat, unexpected: true }]);
  await expect(adapters.createNativeMediaPort().statMedia([stat.id])).rejects.toThrow();
});

it('cancels native streaming hash and does not accept its late result', async () => {
  let finish: (value: unknown) => void = () => undefined;
  fake.hash.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const pending = adapters.createNativeMediaPort().hashFile('content://media/1', controller.signal);
  controller.abort();
  expect(fake.cancel).toHaveBeenCalledWith(fake.prepare.mock.calls[0]?.[0]);
  finish({ sha256: 'ab'.repeat(32), bytes: 123 });
  await expect(pending).rejects.toThrow();
});

it('reads sticky charging state and subscribes to native battery broadcasts', async () => {
  expect(await adapters.chargingSource.read()).toBe(true);
  const changed = vi.fn();
  const off = adapters.chargingSource.subscribe(changed);
  fake.listener({ charging: false });
  expect(changed).toHaveBeenCalledOnce();
  off();
  expect(fake.remove).toHaveBeenCalledOnce();
  expect(adapters.nativeBackupAvailable()).toBe(true);
});

it('reports an absent native backup capability for an older installed runtime', async () => {
  fake.available = false;
  vi.resetModules();
  const absent = await import('./native-adapters');
  expect(absent.nativeBackupAvailable()).toBe(false);
  await expect(absent.createNativeMediaPort().hashFile('content://media/1')).rejects.toThrow(
    'Update the app',
  );
  fake.available = true;
});
