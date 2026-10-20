import * as Notifications from 'expo-notifications';
import type { LiveNotificationNotice } from '@smarteverything/domain';

export const ALERT_CHANNEL = 'live-alerts';

const ALERT_VIBRATION: readonly number[] = [0, 250, 250, 250];

const CATEGORY_KEY = 'categoryId';

export function notificationRequestOf(
  notice: LiveNotificationNotice,
): Notifications.NotificationRequestInput {
  const category = notice.data[CATEGORY_KEY];
  return {
    identifier: notice.id,
    content: {
      title: notice.title,
      body: notice.body,
      data: notice.data,
      ...(category === undefined ? {} : { categoryIdentifier: category }),
    },
    trigger: { channelId: ALERT_CHANNEL },
  };
}

let channel: Promise<unknown> | null = null;

function alertChannel(): Promise<unknown> {
  channel ??= Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
    name: 'Alerts',
    description: 'Doorbell, calls, leaks, alarms and replies while the app is running',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [...ALERT_VIBRATION],
  });
  return channel;
}

export async function presentLiveNotification(notice: LiveNotificationNotice): Promise<void> {
  await alertChannel();
  await Notifications.scheduleNotificationAsync(notificationRequestOf(notice));
}
