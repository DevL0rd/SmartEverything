import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopRouteAuthority } from '../src/hub-network/authority.js';
import { DesktopHubResources } from '../src/hub-network/resources.js';

const shared = vi.hoisted(() => ({
  staging: '',
  controller: new AbortController(),
  save: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  admit: vi.fn(),
  reveal: vi.fn(),
  home: '/fake-desktop-home',
}));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string): string =>
      name === 'userData' ? '/fake-desktop-user-data' : `${shared.home}/${name}`,
  },
  BrowserWindow: class {
    readonly webContents = { id: 42 };
  },
  dialog: { showSaveDialog: shared.save },
  shell: { openPath: shared.open, showItemInFolder: shared.reveal },
}));

vi.mock('@smarteverything/hub/client-network/resource-broker', () => ({
  HubResourceBroker: class {
    readonly admit = shared.admit;
  },
}));

vi.mock('@smarteverything/hub/client-network/resource-download', () => ({
  HubResourceDownloads: class {
    readonly write = shared.write;
    constructor(_policies: unknown, staging: string) {
      shared.staging = staging;
    }
  },
}));

const ID = 'a'.repeat(64);

beforeEach(() => {
  shared.controller = new AbortController();
  shared.staging = '';
  shared.save.mockReset().mockResolvedValue({ canceled: false, filePath: '/chosen/media.mp4' });
  shared.open.mockReset().mockResolvedValue('');
  shared.write.mockReset().mockResolvedValue('/staged/media.mp4');
  shared.admit.mockReset().mockImplementation(() => ({ signal: shared.controller.signal }));
});

function resources(): DesktopHubResources {
  return new DesktopHubResources(
    new DesktopRouteAuthority(() => undefined),
    'app://smarteverything/',
  );
}

describe('desktop resource downloads', () => {
  it('stages native player files in the variant user data directory', async () => {
    const downloads = resources();
    expect(shared.staging).toBe(join('/fake-desktop-user-data', 'media'));
    await expect(
      downloads.download(new BrowserWindow().webContents, { id: ID, intent: 'open' }),
    ).resolves.toBe('completed');
    expect(shared.admit).toHaveBeenCalledWith(42, ID);
    expect(shared.write).toHaveBeenCalledWith({ signal: shared.controller.signal });
    expect(shared.open).toHaveBeenCalledWith('/staged/media.mp4');
  });

  it('keeps save destinations outside the staging directory', async () => {
    await resources().download(new BrowserWindow().webContents, { id: ID, intent: 'save' });
    expect(shared.write).toHaveBeenCalledWith(
      { signal: shared.controller.signal },
      '/chosen/media.mp4',
    );
    expect(shared.open).not.toHaveBeenCalled();
  });

  it('leaves a cancelled save without a staged file', async () => {
    shared.save.mockResolvedValue({ canceled: true });
    await expect(
      resources().download(new BrowserWindow().webContents, { id: ID, intent: 'save' }),
    ).resolves.toBe('cancelled');
    expect(shared.write).not.toHaveBeenCalled();
    expect(shared.open).not.toHaveBeenCalled();
  });

  it('does not open a downloaded file after its owner releases it', async () => {
    shared.write.mockImplementation(() => {
      shared.controller.abort();
      return Promise.resolve('/staged/media.mp4');
    });
    await expect(
      resources().download(new BrowserWindow().webContents, { id: ID, intent: 'open' }),
    ).rejects.toThrow();
    expect(shared.open).not.toHaveBeenCalled();
  });

  it('surfaces a native player failure', async () => {
    shared.open.mockResolvedValue('No player is available');
    await expect(
      resources().download(new BrowserWindow().webContents, { id: ID, intent: 'open' }),
    ).rejects.toThrow('Native media player could not open');
  });
});

describe('saving a photo back to this computer', () => {
  it('moves the downloaded original into Pictures/Restored and shows it in its folder', async () => {
    const home = await mkdtemp(join(tmpdir(), 'desktop-restore-ipc-'));
    try {
      shared.home = home;
      const staged = join(home, 'staged.jpg');
      await writeFile(staged, 'photo bytes');
      shared.write.mockResolvedValue(staged);
      const owner = new BrowserWindow().webContents;
      const done = await resources().restore(owner, {
        id: ID,
        name: 'beach.jpg',
        mimeType: 'image/jpeg',
        sha256: null,
        takenAt: null,
        target: { kind: 'restored' },
      });
      const saved = join(home, 'pictures', 'Restored', 'beach.jpg');
      expect(done).toEqual({ result: 'saved', location: saved });
      expect(await readFile(saved, 'utf8')).toBe('photo bytes');
      await expect(readFile(staged)).rejects.toThrow(/ENOENT/);
      resources().reveal(saved);
      expect(shared.reveal).toHaveBeenCalledWith(saved);
    } finally {
      shared.home = '/fake-desktop-home';
      await rm(home, { recursive: true, force: true });
    }
  });
});
