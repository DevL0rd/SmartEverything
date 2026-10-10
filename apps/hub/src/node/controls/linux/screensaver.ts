import { z } from 'zod';
import type { SessionBus } from './dbus-session';

const SCREENSAVER = {
  destination: 'org.freedesktop.ScreenSaver',
  path: '/org/freedesktop/ScreenSaver',
  iface: 'org.freedesktop.ScreenSaver',
} as const;

const ACTIVE = z.tuple([z.boolean()]);

export async function watchScreenSaver(
  bus: SessionBus,
  onLocked: (locked: boolean) => void,
): Promise<() => void> {
  const stop = await bus.watch(
    { path: SCREENSAVER.path, iface: SCREENSAVER.iface, member: 'ActiveChanged' },
    (body) => {
      onLocked(ACTIVE.parse(body)[0]);
    },
  );
  const [active] = ACTIVE.parse(await bus.call({ ...SCREENSAVER, member: 'GetActive' }));
  onLocked(active);
  return stop;
}
