import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  DESKTOP_DRIVE_CHANGED,
  type DesktopDriveCommand,
  type DesktopDriveState,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ArgumentHandle } from '../../src/ipc.js';

const sent: { channel: string; value: unknown }[] = [];

vi.mock('electron', () => ({
  app: { once: (): void => undefined },
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

const STATE: DesktopDriveState = {
  mount: null,
  sync: null,
  fuse: { available: true },
  firstRun: { pending: true, defaultParent: '/home/u/SmartEverything' },
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
    await handlers.get('desktop:drive-run')?.({ kind: 'first-run-dismissed' });
    expect(ran).toEqual([{ kind: 'first-run-dismissed' }]);
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
});
