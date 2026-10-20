import { randomUUID } from 'node:crypto';
import { liveNotificationId, type LiveNotificationNotice } from '@smarteverything/domain';
import { failureLine, type Logger } from '@smarteverything/logging';
import type { PushNotification } from './fcm';

export type LiveNotifier = (clientId: string, notice: LiveNotificationNotice) => Promise<boolean>;

export type LiveNotificationDraft = Omit<LiveNotificationNotice, 'requestId'>;

export function liveNotificationOf(
  subject: Readonly<Record<string, string>>,
  notification: PushNotification,
): LiveNotificationDraft {
  return {
    type: 'notification',
    id: notification.tag ?? liveNotificationId(subject),
    title: notification.title,
    body: notification.body,
    data: notification.data,
  };
}

async function reached(
  notify: LiveNotifier,
  clientId: string,
  draft: LiveNotificationDraft,
  log: Logger,
): Promise<boolean> {
  try {
    return await notify(clientId, { ...draft, requestId: randomUUID() });
  } catch (cause) {
    log.warn('push.live_failed', { clientId, reason: failureLine(cause).slice(0, 300) });
    return false;
  }
}

export async function clientsReachedLive(
  notify: LiveNotifier,
  clientIds: readonly string[],
  draft: LiveNotificationDraft,
  log: Logger,
): Promise<ReadonlySet<string>> {
  const outcomes = await Promise.all(
    clientIds.map(async (clientId) => ({
      clientId,
      live: await reached(notify, clientId, draft, log),
    })),
  );
  return new Set(outcomes.flatMap(({ clientId, live }) => (live ? [clientId] : [])));
}
