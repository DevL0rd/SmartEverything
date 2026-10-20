import dbus from 'dbus-next';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComputerCapture } from '@smarteverything/domain';
import { LinuxCapture } from '../../../src/node/controls/linux/linux-capture';
import { LinuxInput } from '../../../src/node/controls/linux/input-control';
import {
  availableDeviceTypes,
  type ProbeBus,
} from '../../../src/node/controls/linux/portal-devices';
import {
  openPortalSession,
  type PortalSession,
} from '../../../src/node/controls/linux/portal-session';
import { FileRestoreToken } from '../../../src/node/controls/linux/portal-token';
import { grantingBus, type FakePortalBus } from './portal-bus';

const LEFT = { id: 1, x: 0, y: 0, width: 1920, height: 1080 };
const RIGHT = { id: 2, x: 1920, y: 180, width: 1280, height: 720 };
const PICTURE = { width: 6400, height: 2160 };

interface Rig {
  readonly input: LinuxInput;
  readonly bus: FakePortalBus;
  readonly grants: number[];
}

async function rig(
  options: { picture?: typeof PICTURE | null; locked?: boolean | null } = {},
): Promise<Rig> {
  const bus = grantingBus([LEFT, RIGHT]);
  const { session } = await openPortalSession(bus, null);
  bus.calls.length = 0;
  const grants: number[] = [];
  const input = new LinuxInput({
    grant: {
      obtain: (): Promise<PortalSession> => {
        grants.push(1);
        return Promise.resolve(session);
      },
    },
    deviceTypes: (): Promise<number> => Promise.resolve(3),
    picture: (): typeof PICTURE | null =>
      options.picture === undefined ? PICTURE : options.picture,
    locked: (): boolean | null => (options.locked === undefined ? false : options.locked),
  });
  return { input, bus, grants };
}

function notes(bus: FakePortalBus): (string | number)[][] {
  return bus.calls.map((call) => [call.member, ...(call.body ?? []).slice(2).map(Number)]);
}

const MOTION = 'NotifyPointerMotionAbsolute';
const BUTTON = 'NotifyPointerButton';
const KEY = 'NotifyKeyboardKeysym';
const AXIS = 'NotifyPointerAxisDiscrete';

describe('pointer input', () => {
  it('moves onto the right screen and clicks the left button', async () => {
    const { input, bus } = await rig();
    await input.send({ action: 'click', x: 4000, y: 1080 });
    expect(notes(bus)).toEqual([
      [MOTION, 2, 80, 360],
      [BUTTON, 0x110, 1],
      [BUTTON, 0x110, 0],
    ]);
  });

  it('double clicks and right clicks', async () => {
    const { input, bus } = await rig();
    await input.send({ action: 'double_click', x: 100, y: 100 });
    await input.send({ action: 'right_click', x: 100, y: 100 });
    expect(notes(bus).filter((note) => note[0] === BUTTON)).toEqual([
      [BUTTON, 0x110, 1],
      [BUTTON, 0x110, 0],
      [BUTTON, 0x110, 1],
      [BUTTON, 0x110, 0],
      [BUTTON, 0x111, 1],
      [BUTTON, 0x111, 0],
    ]);
  });

  it('only moves for move', async () => {
    const { input, bus } = await rig();
    await input.send({ action: 'move', x: 300, y: 300 });
    expect(notes(bus)).toEqual([[MOTION, 1, 150, 150]]);
  });

  it('presses, moves and releases for a drag', async () => {
    const { input, bus } = await rig();
    await input.send({ action: 'drag', x: 300, y: 300, toX: 600, toY: 900 });
    expect(notes(bus)).toEqual([
      [MOTION, 1, 150, 150],
      [BUTTON, 0x110, 1],
      [MOTION, 1, 300, 450],
      [BUTTON, 0x110, 0],
    ]);
  });

  it('scrolls vertically and horizontally in wheel notches', async () => {
    const { input, bus } = await rig();
    await input.send({ action: 'scroll', x: 300, y: 300, dx: 0, dy: 3 });
    await input.send({ action: 'scroll', x: 300, y: 300, dx: -2, dy: 0 });
    expect(notes(bus).filter((note) => note[0] === AXIS)).toEqual([
      [AXIS, 0, 3],
      [AXIS, 1, -2],
    ]);
  });

  it('says what to do when no picture of the screen was taken yet', async () => {
    const { input, bus } = await rig({ picture: null });
    await expect(input.send({ action: 'click', x: 1, y: 1 })).rejects.toThrow('Take a picture');
    expect(bus.calls).toEqual([]);
  });

  it('refuses a point between the screens or outside the picture', async () => {
    const { input } = await rig();
    await expect(input.send({ action: 'move', x: 4000, y: 10 })).rejects.toMatchObject({
      code: 'failed',
    });
    await expect(input.send({ action: 'move', x: 6400, y: 10 })).rejects.toThrow('outside');
  });

  it('passes on a failure that is not about the point', async () => {
    const { input, bus } = await rig();
    bus.failing = new Error('bus gone');
    await expect(input.send({ action: 'move', x: 10, y: 10 })).rejects.toThrow('bus gone');
  });
});

describe('keyboard input', () => {
  it('types each character as a press and a release, including emoji and Return', async () => {
    const { input, bus } = await rig();
    await input.send({ action: 'type', text: 'a\n😀' });
    expect(notes(bus)).toEqual([
      [KEY, 0x61, 1],
      [KEY, 0x61, 0],
      [KEY, 0xff0d, 1],
      [KEY, 0xff0d, 0],
      [KEY, 0x01000000 + 0x1f600, 1],
      [KEY, 0x01000000 + 0x1f600, 0],
    ]);
  });

  it('holds modifiers around a key and lets go in reverse', async () => {
    const { input, bus } = await rig();
    await input.send({ action: 'keys', keys: 'ctrl+shift+t' });
    expect(notes(bus)).toEqual([
      [KEY, 0xffe3, 1],
      [KEY, 0xffe1, 1],
      [KEY, 0x74, 1],
      [KEY, 0x74, 0],
      [KEY, 0xffe1, 0],
      [KEY, 0xffe3, 0],
    ]);
  });

  it('presses a lone named key', async () => {
    const { input, bus } = await rig();
    await input.send({ action: 'keys', keys: 'Return' });
    expect(notes(bus)).toEqual([
      [KEY, 0xff0d, 1],
      [KEY, 0xff0d, 0],
    ]);
  });

  it('fails loudly for a control character that cannot be typed', async () => {
    const { input } = await rig();
    await expect(input.send({ action: 'type', text: '\u0007' })).rejects.toThrow('cannot be typed');
  });
});

describe('who may send input', () => {
  it('refuses at a locked screen before asking for the grant', async () => {
    const { input, grants, bus } = await rig({ locked: true });
    await expect(input.send({ action: 'type', text: 'x' })).rejects.toMatchObject({
      code: 'no_session',
    });
    expect(grants).toEqual([]);
    expect(bus.calls).toEqual([]);
  });

  it('refuses while the lock state is not known yet', async () => {
    const { input, grants, bus } = await rig({ locked: null });
    await expect(input.send({ action: 'type', text: 'x' })).rejects.toThrow('not known');
    expect(grants).toEqual([]);
    expect(bus.calls).toEqual([]);
  });

  it('asks for the grant on every send and passes its refusal on', async () => {
    const input = new LinuxInput({
      grant: { obtain: (): Promise<PortalSession> => Promise.reject(new Error('not approved')) },
      deviceTypes: (): Promise<number> => Promise.resolve(3),
      picture: (): typeof PICTURE => PICTURE,
      locked: (): false => false,
    });
    await expect(input.send({ action: 'type', text: 'x' })).rejects.toThrow('not approved');
  });
});

describe('the input feature', () => {
  function probe(types: number | Error): { open: () => ProbeBus; closed: number[] } {
    const closed: number[] = [];
    return {
      closed,
      open: (): ProbeBus => ({
        connected: (): Promise<void> => Promise.resolve(),
        call: (): Promise<readonly unknown[]> =>
          types instanceof Error
            ? Promise.reject(types)
            : Promise.resolve([new dbus.Variant('u', types)]),
        close: (): void => {
          closed.push(1);
        },
      }),
    };
  }

  async function features(types: number | Error): Promise<readonly string[]> {
    const { open } = probe(types);
    const input = new LinuxInput({
      grant: { obtain: (): Promise<PortalSession> => Promise.reject(new Error('unused')) },
      deviceTypes: (): Promise<number> => availableDeviceTypes(open),
      picture: (): null => null,
      locked: (): null => null,
    });
    return input.features();
  }

  it('is offered when the portal can do keyboard and pointer', async () => {
    expect(await features(7)).toEqual(['input']);
  });

  it('is not offered when a device kind is missing or the portal is absent', async () => {
    expect(await features(1)).toEqual([]);
    expect(await features(new Error('no portal'))).toEqual([]);
  });

  it('closes the connection it opened to ask', async () => {
    const { open, closed } = probe(7);
    await availableDeviceTypes(open);
    expect(closed).toEqual([1]);
  });
});

describe('the restore token file', () => {
  it('keeps the token private and reads it back', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'portal-token-'));
    try {
      const store = new FileRestoreToken(join(directory, 'state', 'remote-input.token'));
      expect(await store.read()).toBeNull();
      await store.write('abc');
      expect(await store.read()).toBe('abc');
      expect((await stat(join(directory, 'state', 'remote-input.token'))).mode & 0o777).toBe(0o600);
      expect(await readFile(join(directory, 'state', 'remote-input.token'), 'utf8')).toBe('abc\n');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('treats an empty file as no token and passes on other read failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'portal-token-'));
    try {
      const empty = new FileRestoreToken(join(directory, 'empty'));
      await empty.write('');
      expect(await empty.read()).toBeNull();
      await expect(new FileRestoreToken(directory).read()).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('the picture the pointer follows', () => {
  const capture = (width: number): ComputerCapture => ({
    mimeType: 'image/jpeg',
    data: '',
    width,
    height: 100,
    at: '2026-10-18T10:00:00.000Z',
  });

  it('remembers the size of the last screen picture and ignores window pictures', async () => {
    const shot = new LinuxCapture(
      {
        capture: (target): Promise<ComputerCapture> =>
          Promise.resolve(capture(target === 'screen' ? 1500 : 700)),
      },
      { capture: (): Promise<ComputerCapture> => Promise.reject(new Error('unused')) },
      (): boolean => true,
    );
    expect(shot.picture()).toBeNull();
    await shot.capture('focused');
    expect(shot.picture()).toBeNull();
    await shot.capture('screen');
    expect(shot.picture()).toEqual({ width: 1500, height: 100 });
    await shot.capture('focused');
    expect(shot.picture()).toEqual({ width: 1500, height: 100 });
  });

  it('takes the picture from the session agent away from Plasma', async () => {
    const shot = new LinuxCapture(
      { capture: (): Promise<ComputerCapture> => Promise.reject(new Error('unused')) },
      { capture: (): Promise<ComputerCapture> => Promise.resolve(capture(1500)) },
      (): boolean => false,
    );
    await shot.capture('screen');
    expect(shot.picture()?.width).toBe(1500);
  });
});
