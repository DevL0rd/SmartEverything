import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  DESKTOP_DRIVE_CHANGED,
  type DesktopDriveCommand,
  type DesktopDriveState,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ArgumentHandle } from '../../src/ipc.js';

const sent: { channel: string; value: unknown }[] = [];
const opened: string[] = [];
let openFailure = '';

vi.mock('electron', () => ({
  app: { once: (): void => undefined },
  shell: {
    openPath: (path: string): Promise<string> => {
      opened.push(path);
      return Promise.resolve(openFailure);
    },
  },
  BrowserWindow: {
    getAllWindows: (): readonly unknown[] => [
      {
        webContents: {
          isDestroyed: (): boolean => false,
          send: (channel: string, value: unknown): void => {
            sent.push({ channel, value });
          },
        },
      },
    ],
  },
}));

const { registerDriveIpc } = await import('../../src/drive-mount/bridge-ipc.js');

const MOUNT = '11111111-1111-4111-8111-111111111111';

const STATE: DesktopDriveState = {
  mount: {
    status: 'Mounted',
    mounted: true,
    points: [{ placementId: MOUNT, point: '/run/user/1000/smarteverything/Photos' }],
  },
  sync: null,
  fuse: { available: true },
  cache: DEFAULT_DESKTOP_DRIVE_CACHE,
};

function wired(): {
  readonly handlers: Map<string, (argument: unknown) => unknown>;
  readonly ran: DesktopDriveCommand[];
  readonly emit: (state: DesktopDriveState | null) => void;
} {
  const handlers = new Map<string, (argument: unknown) => unknown>();
  const ran: DesktopDriveCommand[] = [];
  let listener: (state: DesktopDriveState | null) => void = () => undefined;
  const handle: ArgumentHandle = (channel, handler) => {
    handlers.set(channel, handler);
  };
  registerDriveIpc(handle, {
    current: STATE,
    run: (command) => {
      ran.push(command);
      return Promise.resolve(STATE);
    },
    onState: (next) => {
      listener = next;
      return (): void => undefined;
    },
  });
  return {
    handlers,
    ran,
    emit: (state): void => {
      listener(state);
    },
  };
}

describe('drive bridge', () => {
  it('answers the last state and runs only valid commands', async () => {
    const { handlers, ran } = wired();
    expect(handlers.get('desktop:drive-state')?.(undefined)).toEqual(STATE);
    await handlers.get('desktop:drive-run')?.({ kind: 'sync-pause' });
    expect(ran).toEqual([{ kind: 'sync-pause' }]);
    expect(() => handlers.get('desktop:drive-run')?.({ kind: 'format-disk' })).toThrow();
  });

  it('pushes every state change to the app windows', () => {
    const { emit } = wired();
    sent.length = 0;
    emit(null);
    emit(STATE);
    expect(sent).toEqual([
      { channel: DESKTOP_DRIVE_CHANGED, value: null },
      { channel: DESKTOP_DRIVE_CHANGED, value: STATE },
    ]);
  });

  it('opens only a mounted folder, at the point this computer reported', async () => {
    const { handlers } = wired();
    opened.length = 0;
    openFailure = '';
    await handlers.get('desktop:drive-open')?.(MOUNT);
    expect(opened).toEqual(['/run/user/1000/smarteverything/Photos']);
    await expect(
      handlers.get('desktop:drive-open')?.('22222222-2222-4222-8222-222222222222'),
    ).rejects.toThrow(/not mounted/);
    await expect(handlers.get('desktop:drive-open')?.('/etc/passwd')).rejects.toThrow(
      /not mounted/,
    );
    openFailure = 'No application is registered';
    await expect(handlers.get('desktop:drive-open')?.(MOUNT)).rejects.toThrow(/No application/);
    expect(opened).toHaveLength(2);
  });
});
