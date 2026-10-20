import { z } from 'zod';
import { variant, type SessionBus } from './dbus-session';
import { PORTAL_DESTINATION, PORTAL_PATH, REMOTE_DESKTOP } from './portal-request';

const DEVICES = z.tuple([variant(z.number())]);
export const KEYBOARD_AND_POINTER = 3;

export type ProbeBus = Pick<SessionBus, 'connected' | 'call' | 'close'>;

export async function availableDeviceTypes(open: () => ProbeBus): Promise<number> {
  const bus = open();
  try {
    await bus.connected();
    const reply = await bus.call({
      destination: PORTAL_DESTINATION,
      path: PORTAL_PATH,
      iface: 'org.freedesktop.DBus.Properties',
      member: 'Get',
      signature: 'ss',
      body: [REMOTE_DESKTOP, 'AvailableDeviceTypes'],
    });
    return DEVICES.parse(reply)[0];
  } finally {
    bus.close();
  }
}
