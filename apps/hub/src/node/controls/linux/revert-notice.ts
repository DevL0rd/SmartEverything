import dbus from 'dbus-next';
import { z } from 'zod';
import type { SessionBus } from './dbus-session';

const NOTIFICATIONS = {
  destination: 'org.freedesktop.Notifications',
  path: '/org/freedesktop/Notifications',
  iface: 'org.freedesktop.Notifications',
} as const;

const APP_NAME = 'SmartEverything';
const TITLE = 'Keep these display settings?';
const URGENT = 2;
const SECOND_MS = 1000;
const NOTIFY_SIGNATURE = 'susssasa{sv}i';
const ID = z.tuple([z.number()]);
const INVOKED = z.tuple([z.number(), z.string()]);

export type NoticeBus = Pick<SessionBus, 'call' | 'watch'>;

export type NoticeAnswer = 'keep' | 'revert';

export type CloseNotice = () => Promise<void>;

export interface RevertNotice {
  readonly show: (
    summary: string,
    seconds: number,
    answered: (answer: NoticeAnswer) => void,
  ) => Promise<CloseNotice>;
}

function isAnswer(key: string): key is NoticeAnswer {
  return key === 'keep' || key === 'revert';
}

export class DesktopRevertNotice implements RevertNotice {
  constructor(private readonly bus: () => NoticeBus) {}

  async show(
    summary: string,
    seconds: number,
    answered: (answer: NoticeAnswer) => void,
  ): Promise<CloseNotice> {
    const bus = this.bus();
    const [id] = ID.parse(
      await bus.call({
        ...NOTIFICATIONS,
        member: 'Notify',
        signature: NOTIFY_SIGNATURE,
        body: [
          APP_NAME,
          0,
          'video-display',
          TITLE,
          `${summary}. Reverting in ${String(seconds)} s.`,
          ['keep', 'Keep', 'revert', 'Revert'],
          { urgency: new dbus.Variant('y', URGENT), resident: new dbus.Variant('b', true) },
          seconds * SECOND_MS,
        ],
      }),
    );
    const stop = await bus.watch(
      { path: NOTIFICATIONS.path, iface: NOTIFICATIONS.iface, member: 'ActionInvoked' },
      (body) => {
        const [invoked, key] = INVOKED.parse(body);
        if (invoked === id && isAnswer(key)) {
          answered(key);
        }
      },
    );
    return async (): Promise<void> => {
      stop();
      await bus.call({
        ...NOTIFICATIONS,
        member: 'CloseNotification',
        signature: 'u',
        body: [id],
      });
    };
  }
}
