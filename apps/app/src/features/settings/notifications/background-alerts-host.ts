import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { API_ENDPOINTS as E, ApiError, type LiveNotificationNotice } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { errorFields } from '../../../design/log-tally';
import { api, connectionRefused, useConnection } from '../../../api/transport';
import { presentLiveNotification } from '../../../platform/live-notification';
import { pushPermission } from '../../../platform/push';
import { BackgroundLink } from '../../../store/background-link';
import { followBackground } from '../../../store/background-follow';
import { openLiveSocket } from '../../../store/live-socket';
import { runPushCommandNotice } from '../../../store/push-command-notice';

const log = new Logger('app.alerts');

async function answerAction(
  notice: LiveNotificationNotice,
  ok: boolean,
  detail: string,
): Promise<void> {
  await api().call(E.answerPhoneAction, {
    body: { requestId: notice.requestId, ok, detail },
  });
}

async function confirmPresented(notice: LiveNotificationNotice): Promise<void> {
  try {
    await answerAction(notice, true, 'Shown');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'not_found') {
      log.info('alerts.confirm_settled', { id: notice.id, requestId: notice.requestId });
      return;
    }
    throw error;
  }
}

async function refusePresented(notice: LiveNotificationNotice, cause: unknown): Promise<void> {
  try {
    await answerAction(notice, false, String(cause));
  } catch (error) {
    log.warn('alerts.refusal_failed', { id: notice.id, ...errorFields(error) });
  }
}

async function presentAndConfirm(notice: LiveNotificationNotice): Promise<void> {
  try {
    await presentLiveNotification(notice);
  } catch (cause) {
    await refusePresented(notice, cause);
    throw cause;
  }
  background(confirmPresented(notice), 'alerts.confirm_failed', { id: notice.id });
}

export function presentLiveAlert(notice: LiveNotificationNotice): void {
  background(presentAndConfirm(notice), 'alerts.present_failed', { id: notice.id });
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
      notification: presentLiveAlert,
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
