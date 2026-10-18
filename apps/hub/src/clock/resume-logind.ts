import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { SessionBus } from '../node/controls/linux/dbus-session';
import { messageOf } from '@smarteverything/logging';

const SLEEP_BODY = z.tuple([z.boolean()]);
const NO_SYSTEM_BUS = /ENOENT|ECONNREFUSED/;
const SLEEP_SIGNAL = {
  path: '/org/freedesktop/login1',
  iface: 'org.freedesktop.login1.Manager',
  member: 'PrepareForSleep',
} as const;

export type ResumeBus = Pick<SessionBus, 'watch' | 'close' | 'onError'>;

export interface LogindWatchOptions {
  readonly log: Logger;
  readonly onResume: () => void;
}

export function watchLogind(bus: ResumeBus, options: LogindWatchOptions): () => void {
  const { log } = options;
  let reported = false;
  const failed = (cause: unknown): void => {
    if (reported) {
      return;
    }
    reported = true;
    if (NO_SYSTEM_BUS.test(messageOf(cause))) {
      log.warn('clock.resume_watch_unavailable', {
        reason: 'no_system_bus',
        detail: messageOf(cause),
        consequence: 'timers will not re-arm after the host sleeps',
      });
      return;
    }
    log.error('clock.resume_watch_failed', cause);
  };
  bus.onError(failed);
  const watching = bus.watch(SLEEP_SIGNAL, (body) => {
    const parsed = SLEEP_BODY.safeParse(body);
    if (!parsed.success) {
      log.warn('clock.resume_signal_malformed', { received: JSON.stringify(body) });
      return;
    }
    if (!parsed.data[0]) {
      log.info('clock.jumped', { source: 'logind' });
      options.onResume();
    }
  });
  watching.catch(failed);
  return () => {
    watching.then(
      (unwatch) => {
        unwatch();
      },
      () => undefined,
    );
    bus.close();
  };
}
