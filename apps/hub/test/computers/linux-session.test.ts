import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionBus } from '../../src/node/controls/linux/dbus-session';
import { DesktopEntries } from '../../src/node/controls/linux/desktop-entries';
import { KdeBridge } from '../../src/node/controls/linux/kde-bridge';
import { LinuxSession } from '../../src/node/controls/linux/linux-session';
import { MprisPlayers } from '../../src/node/controls/linux/mpris';
import { PulseAudio } from '../../src/node/controls/linux/pulse-audio';

const stopVolume = vi.fn();

let daemon: ChildProcessByStdio<null, Readable, null>;

async function privateBus(): Promise<string> {
  daemon = spawn('dbus-daemon', ['--session', '--nofork', '--print-address=1'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const lines = createInterface({ input: daemon.stdout });
  for await (const line of lines) {
    return line;
  }
  throw new Error('dbus-daemon printed no address');
}

function newSession(): LinuxSession {
  return new LinuxSession({
    audio: new PulseAudio({
      run: (): Promise<string> => Promise.resolve(''),
      probe: (): Promise<boolean> => Promise.resolve(false),
      lines: () => (): undefined => undefined,
      failed: (): undefined => undefined,
    }),
    entries: new DesktopEntries(),
    now: (): Date => new Date(),
    failed: (): undefined => undefined,
  });
}

beforeEach(async () => {
  vi.stubEnv('DBUS_SESSION_BUS_ADDRESS', await privateBus());
});

afterEach(() => {
  stopVolume.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  daemon.kill();
});

describe.skipIf(process.platform !== 'linux')('LinuxSession stopped while it connects', () => {
  it('closes the bus it opened and starts nothing', async () => {
    const closed = vi.spyOn(SessionBus.prototype, 'close');
    const volume = vi.spyOn(PulseAudio.prototype, 'watchMaster').mockReturnValue(stopVolume);
    const session = newSession();
    const started = session.start(() => undefined);
    await session.stop();
    await started;
    expect(closed).toHaveBeenCalledTimes(1);
    expect(volume).not.toHaveBeenCalled();
    await session.stop();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(() => session.bridge()).toThrow(/Nobody is signed in/);
  });

  it('still starts and stops normally on a reachable bus', async () => {
    const closed = vi.spyOn(SessionBus.prototype, 'close');
    const volume = vi.spyOn(PulseAudio.prototype, 'watchMaster').mockReturnValue(stopVolume);
    vi.spyOn(KdeBridge.prototype, 'start').mockResolvedValue(undefined);
    vi.spyOn(KdeBridge.prototype, 'stop').mockResolvedValue(undefined);
    vi.spyOn(MprisPlayers.prototype, 'start').mockResolvedValue(undefined);
    const session = newSession();
    await session.start(() => undefined);
    expect(volume).toHaveBeenCalledTimes(1);
    expect(session.bridge()).toBeDefined();
    await session.stop();
    expect(stopVolume).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
