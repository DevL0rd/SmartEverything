import { Logger } from '@smarteverything/logging';
import { Notification } from 'electron';
import { missedNotice, ringingNotice } from './ring-copy.js';
import type { DesktopRing, RingNotifier } from './ring-types.js';

const log = new Logger('desktop.planner-ring');
const shown = new Set<Notification>();

function show(
  content: { readonly title: string; readonly body: string },
  onClick: () => void,
): void {
  if (!Notification.isSupported()) {
    log.warn('planner_ring.notification_unsupported');
    return;
  }
  const notification = new Notification(content);
  shown.add(notification);
  notification.on('click', onClick);
  notification.on('close', () => {
    shown.delete(notification);
  });
  notification.show();
}

export const electronRingNotifier: RingNotifier = {
  ringing: (ring: DesktopRing, onClick) => {
    show(ringingNotice(ring), onClick);
  },
  missed: (ring: DesktopRing) => {
    show(missedNotice(ring), () => undefined);
  },
};
