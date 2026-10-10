import {
  DEFAULT_COMPUTER_SCOPES,
  DEVICE_COMMAND,
  type ComputerSessionState,
  type DeviceCommand,
  type NodeRequest,
} from '@smarteverything/domain';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppFocusTracker, type AppTime } from '../../src/computers/app-focus';
import {
  runComputerCommand,
  type ComputerCommandContext,
} from '../../src/computers/computer-commands';
import { sessionCapabilities, sessionReadings } from '../../src/computers/session-readings';
import { parseDesktopEntry } from '../../src/node/controls/linux/desktop-entries';
import { HomeFiles } from '../../src/node/controls/linux/home-files';
import { jpegSize } from '../../src/node/controls/linux/jpeg-size';
import { parseVolume } from '../../src/node/controls/linux/pulse-volume';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const SESSION: ComputerSessionState = {
  at: '2026-10-10T10:00:00.000Z',
  user: 'devl0rd',
  locked: false,
  focused: { id: 'org.kde.dolphin', name: 'Dolphin' },
  volume: 42.4,
  muted: false,
  media: { player: 'spotify', title: 'Song', artist: 'Band', status: 'playing' },
};

function command(capability: string, value: unknown): DeviceCommand {
  return DEVICE_COMMAND.parse({
    commandId: '00000000-0000-4000-8000-000000000001',
    externalId: 'computer:abc',
    capability,
    value,
  });
}

describe('session readings', () => {
  it('turns a session into device readings and hides the app in front without permission', () => {
    expect(sessionReadings(SESSION, true)).toEqual([
      { key: 'signed_in_user', value: 'devl0rd' },
      { key: 'locked', value: false },
      { key: 'focused_app', value: 'Dolphin' },
      { key: 'volume', value: 42 },
      { key: 'mute', value: false },
      { key: 'playback', value: 'playing' },
      { key: 'now_playing', value: 'Song – Band' },
    ]);
    expect(sessionCapabilities(SESSION, false).map((capability) => capability.key)).not.toContain(
      'focused_app',
    );
  });

  it('counts time per app and stops counting while locked', () => {
    const times: AppTime[] = [];
    const tracker = new AppFocusTracker((time) => times.push(time));
    tracker.observe('device-1', SESSION, true);
    tracker.observe('device-1', { ...SESSION, at: '2026-10-10T10:01:00.000Z', locked: true }, true);
    tracker.observe('device-1', { ...SESSION, at: '2026-10-10T10:05:00.000Z' }, true);
    tracker.end(new Date('2026-10-10T10:06:00.000Z'));
    expect(times.map((time) => (time.endedAt.getTime() - time.startedAt.getTime()) / 1000)).toEqual(
      [60, 60],
    );
  });
});

describe('media commands (fake node)', () => {
  it('sends volume, mute and playback to the node without power checks', async () => {
    const requests: NodeRequest[] = [];
    const context: ComputerCommandContext = {
      directory: {
        byExternalId: () => ({
          call: (request: NodeRequest): Promise<null> => {
            requests.push(request);
            return Promise.resolve(null);
          },
        }),
      },
      deviceIdOf: () => 'device-1',
      scopesOf: () => ({ ...DEFAULT_COMPUTER_SCOPES, power: false }),
      originOf: () => ({ source: 'assistant', client: null }),
      macsOf: () => [],
      wake: (): Promise<void> => Promise.resolve(),
      sink: {
        state: () => undefined,
        event: () => undefined,
        devices: () => undefined,
        failure: () => undefined,
      },
      now: () => new Date(),
    };
    await runComputerCommand(command('volume', 30), context);
    await runComputerCommand(command('mute', true), context);
    await runComputerCommand(command('playback', 'paused'), context);
    expect(requests).toEqual([
      { verb: 'volume', level: 30 },
      { verb: 'mute', muted: true },
      { verb: 'playback', status: 'paused' },
    ]);
  });
});

describe('linux parsers', () => {
  it('reads pactl volume and mute', () => {
    expect(
      parseVolume(
        'Volume: front-left: 32768 /  50% / -18.06 dB,   front-right: 32768 /  50%',
        'Mute: yes',
      ),
    ).toEqual({ volume: 50, muted: true });
  });

  it('keeps visible applications from desktop entries', () => {
    const entry =
      '[Desktop Entry]\nType=Application\nName=Dolphin\nIcon=system-file-manager\n[Desktop Action new]\nName=New';
    expect(parseDesktopEntry('org.kde.dolphin', '/x.desktop', entry)).toEqual({
      id: 'org.kde.dolphin',
      path: '/x.desktop',
      name: 'Dolphin',
      comment: null,
      icon: 'system-file-manager',
    });
    expect(
      parseDesktopEntry(
        'hidden',
        '/h.desktop',
        '[Desktop Entry]\nType=Application\nName=X\nNoDisplay=true',
      ),
    ).toBeNull();
  });

  it('reads the size of a JPEG', () => {
    const frame = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03, 0, 0, 0, 0, 0,
    ]);
    expect(jpegSize(frame)).toEqual({ width: 1280, height: 720 });
  });
});

describe('home files', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'home-files-'));
    await mkdir(join(home, 'Documents'));
    await writeFile(join(home, 'notes.txt'), 'hello');
    await writeFile(join(home, 'photo.bin'), Buffer.from([0, 1, 2]));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('lists folders first and reads text or base64', async () => {
    const files = new HomeFiles(home);
    const list = await files.list(null);
    expect(list.entries.map((entry) => entry.name)).toEqual([
      'Documents',
      'notes.txt',
      'photo.bin',
    ]);
    expect(list.parent).toBeNull();
    await expect(files.read(join(home, 'notes.txt'))).resolves.toMatchObject({
      encoding: 'text',
      content: 'hello',
    });
    await expect(files.read(join(home, 'photo.bin'))).resolves.toMatchObject({
      encoding: 'base64',
      content: 'AAEC',
    });
  });

  it('refuses anything outside the home folder', async () => {
    await expect(new HomeFiles(home).list('/etc')).rejects.toMatchObject({ code: 'not_permitted' });
  });
});

describe('app hours store', () => {
  let opened: TestStore;

  beforeEach(async () => {
    captureLogs();
    opened = await testStore();
  });

  afterEach(async () => {
    await opened.close();
  });

  it('adds up time per app', () => {
    const [device] = opened.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'computer:abc',
        parentId: null,
        kind: 'computer',
        name: 'Desk',
        model: 'smarteverything.computer',
        manufacturer: 'Linux',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    const deviceId = device?.id ?? '';
    const add = (minutes: number, start: string): void => {
      const startedAt = new Date(start);
      opened.store.appSessions.add({
        deviceId,
        appId: 'org.kde.dolphin',
        appName: 'Dolphin',
        startedAt,
        endedAt: new Date(startedAt.getTime() + minutes * 60_000),
      });
    };
    add(5, '2026-10-08T09:00:00.000Z');
    add(10, '2026-10-08T09:30:00.000Z');
    expect(opened.store.appSessions.usage(deviceId, new Date('2026-10-08T00:00:00.000Z'))).toEqual([
      { appId: 'org.kde.dolphin', name: 'Dolphin', seconds: 900 },
    ]);
  });
});
