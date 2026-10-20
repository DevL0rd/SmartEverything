import dbus from 'dbus-next';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import { variant } from './dbus-session';
import { KEYBOARD_AND_POINTER } from './portal-devices';
import {
  PORTAL_DESTINATION,
  PORTAL_PATH,
  REMOTE_DESKTOP,
  SCREEN_CAST,
  portalRequest,
  randomToken,
  type PortalBus,
  type PortalResults,
} from './portal-request';

const MONITOR_SOURCE = 1;
const PERSIST_UNTIL_REVOKED = 2;
const SESSION_IFACE = 'org.freedesktop.portal.Session';

const STREAM = z.tuple([
  z.number(),
  z.object({
    position: variant(z.tuple([z.number(), z.number()])),
    size: variant(z.tuple([z.number(), z.number()])),
  }),
]);

const STARTED = z.object({
  streams: variant(z.array(STREAM)),
  restore_token: variant(z.string()).optional(),
});

const CREATED = z.object({ session_handle: variant(z.string().min(1)) });

export interface PortalStream {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OpenedPortalSession {
  readonly session: PortalSession;
  readonly restoreToken: string | null;
}

async function createSession(bus: PortalBus): Promise<string> {
  const results = await portalRequest(bus, {
    iface: REMOTE_DESKTOP,
    member: 'CreateSession',
    signature: 'a{sv}',
    head: [],
    options: { session_handle_token: new dbus.Variant('s', randomToken()) },
  });
  return CREATED.parse(results).session_handle;
}

async function selectDevices(
  bus: PortalBus,
  session: string,
  restoreToken: string | null,
): Promise<void> {
  await portalRequest(bus, {
    iface: REMOTE_DESKTOP,
    member: 'SelectDevices',
    signature: 'oa{sv}',
    head: [session],
    options: {
      types: new dbus.Variant('u', KEYBOARD_AND_POINTER),
      persist_mode: new dbus.Variant('u', PERSIST_UNTIL_REVOKED),
      ...(restoreToken === null ? {} : { restore_token: new dbus.Variant('s', restoreToken) }),
    },
  });
}

async function selectSources(bus: PortalBus, session: string): Promise<void> {
  await portalRequest(bus, {
    iface: SCREEN_CAST,
    member: 'SelectSources',
    signature: 'oa{sv}',
    head: [session],
    options: {
      types: new dbus.Variant('u', MONITOR_SOURCE),
      multiple: new dbus.Variant('b', true),
    },
  });
}

function streamsOf(results: PortalResults): { streams: PortalStream[]; token: string | null } {
  const started = STARTED.parse(results);
  const streams = started.streams.map(([id, properties]) => ({
    id,
    x: properties.position[0],
    y: properties.position[1],
    width: properties.size[0],
    height: properties.size[1],
  }));
  return { streams, token: started.restore_token ?? null };
}

export async function openPortalSession(
  bus: PortalBus,
  restoreToken: string | null,
): Promise<OpenedPortalSession> {
  const handle = await createSession(bus);
  await selectDevices(bus, handle, restoreToken);
  await selectSources(bus, handle);
  const started = await portalRequest(bus, {
    iface: REMOTE_DESKTOP,
    member: 'Start',
    signature: 'osa{sv}',
    head: [handle, ''],
    options: {},
  });
  const { streams, token } = streamsOf(started);
  if (streams.length === 0) {
    throw new NodeFailureError('failed', 'The desktop shared no screen for remote control.');
  }
  return { session: new PortalSession(bus, handle, streams), restoreToken: token };
}

export class PortalSession {
  constructor(
    private readonly bus: PortalBus,
    private readonly handle: string,
    readonly streams: readonly PortalStream[],
  ) {}

  watchClosed(onClosed: () => void): Promise<() => void> {
    return this.bus.watch({ iface: SESSION_IFACE, member: 'Closed', path: this.handle }, onClosed);
  }

  pointerMotion(stream: number, x: number, y: number): Promise<unknown> {
    return this.notify('NotifyPointerMotionAbsolute', 'oa{sv}udd', [stream, x, y]);
  }

  button(code: number, pressed: boolean): Promise<unknown> {
    return this.notify('NotifyPointerButton', 'oa{sv}iu', [code, pressed ? 1 : 0]);
  }

  axisDiscrete(axis: number, steps: number): Promise<unknown> {
    return this.notify('NotifyPointerAxisDiscrete', 'oa{sv}ui', [axis, steps]);
  }

  keysym(keysym: number, pressed: boolean): Promise<unknown> {
    return this.notify('NotifyKeyboardKeysym', 'oa{sv}iu', [keysym, pressed ? 1 : 0]);
  }

  private notify(member: string, signature: string, values: readonly unknown[]): Promise<unknown> {
    return this.bus.call({
      destination: PORTAL_DESTINATION,
      path: PORTAL_PATH,
      iface: REMOTE_DESKTOP,
      member,
      signature,
      body: [this.handle, {}, ...values],
    });
  }
}
