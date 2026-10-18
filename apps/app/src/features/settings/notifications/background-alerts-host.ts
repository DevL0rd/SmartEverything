import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type LiveNotificationNotice } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api, connectionRefused, useConnection } from '../../../api/transport';
import { presentLiveNotification } from '../../../platform/live-notification';
import { pushPermission } from '../../../platform/push';
import { BackgroundLink } from '../../../store/background-link';
import { followBackground } from '../../../store/background-follow';
import { openLiveSocket } from '../../../store/live-socket';
import { runPushCommandNotice } from '../../../store/push-command-notice';

async function presentAndConfirm(notice: LiveNotificationNotice): Promise<void> {
  try {
    await presentLiveNotification(notice);
  } catch (cause) {
    await api().call(E.answerPhoneAction, {
      body: { requestId: notice.requestId, ok: false, detail: String(cause) },
    });
    throw cause;
  }
  await api().call(E.answerPhoneAction, {
    body: { requestId: notice.requestId, ok: true, detail: 'Shown' },
  });
}

export function BackgroundAlertsHost(): null {
  const connection = useConnection();
  const paired = connection.status === 'paired' ? connection.connection : null;
  useEffect(() => {
    if (paired === null) {
      return undefined;
    }
    const link = new BackgroundLink(paired, {
      open: openLiveSocket,
      notification: (notice): void => {
        background(presentAndConfirm(notice), 'alerts.present_failed', { id: notice.id });
      },
      pushCommand: runPushCommandNotice,
      refused: (): void => {
        connectionRefused(paired);
      },
    });
    const stopFollowing = followBackground(link, {
      current: () => AppState.currentState,
      onChange: (listener) => {
        const subscription = AppState.addEventListener('change', listener);
        return (): void => {
          subscription.remove();
        };
      },
      alertsAllowed: async () => (await pushPermission()) === 'granted',
    });
    const stopOnline = onlineManager.subscribe((isOnline) => {
      if (isOnline) link.online();
    });
    return (): void => {
      stopOnline();
      stopFollowing();
    };
  }, [paired]);
  return null;
}
