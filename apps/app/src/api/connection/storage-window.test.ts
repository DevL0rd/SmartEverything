import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = `set_${'a'.repeat(64)}`;
const bridge = {
  server: vi.fn(),
  setWindow: vi.fn(),
};

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('../../design/platform', () => ({ desktopBridge: (): typeof bridge => bridge }));

const { forgetConnection, readStoredConnection, storeConnection } = await import('./storage');

beforeEach(() => {
  bridge.server.mockReset();
  bridge.setWindow.mockReset().mockResolvedValue(undefined);
});

describe('the desktop window of a computer that runs as a node', () => {
  it('is unpaired until the desktop app holds a connection for it', async () => {
    bridge.server.mockResolvedValue(null);
    expect(await readStoredConnection('desktop')).toBeNull();
  });

  it('hands a connection made on the Pair screen to the desktop app to keep', async () => {
    await storeConnection('desktop', { url: 'https://home.example.com', token: TOKEN });
    expect(bridge.setWindow).toHaveBeenCalledWith({
      url: 'https://home.example.com',
      token: TOKEN,
    });
  });

  it('reads back what the desktop app keeps', async () => {
    bridge.server.mockResolvedValue({ url: 'https://home.example.com/', token: TOKEN });
    expect(await readStoredConnection('desktop')).toEqual({
      url: 'https://home.example.com',
      token: TOKEN,
    });
  });

  it('asks the desktop app to forget a pairing the home refused', async () => {
    await forgetConnection('desktop');
    expect(bridge.setWindow).toHaveBeenCalledWith(null);
  });
});
