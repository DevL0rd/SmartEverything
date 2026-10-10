import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useLastNotificationResponse } from 'expo-notifications';
import { isCamera } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { consentTapOf, isBodyReadingTap, isProfileDetailsTap, pushTapOf } from './push-tap';
import { useEntityStore } from '../store/store-context';
import { href } from './hrefs';

const log = new Logger('app.push');

function handledOwnTap(data: unknown): boolean {
  if (isBodyReadingTap(data)) {
    log.info('push.opened', { kind: 'body_reading' });
    return true;
  }
  if (isProfileDetailsTap(data)) {
    router.navigate(href.fitnessSetup());
    return true;
  }
  const consent = consentTapOf(data);
  if (consent !== null) {
    router.navigate(href.consent(consent.consentId));
  }
  return consent !== null;
}

export function NotificationTaps(): ReactNode {
  const response = useLastNotificationResponse();
  const store = useEntityStore();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (response === null || response === undefined) {
      return;
    }
    const identifier = response.notification.request.identifier;
    if (handled.current === identifier) {
      return;
    }
    handled.current = identifier;
    if (handledOwnTap(response.notification.request.content.data)) {
      return;
    }
    const tap = pushTapOf(response.notification.request.content.data);
    if (tap === null) {
      return;
    }
    log.info('push.opened', { kind: tap.kind });
    const device =
      tap.deviceId === undefined ? undefined : store.get().tables.devices.byId[tap.deviceId];
    if (device === undefined) {
      return;
    }
    router.navigate(
      isCamera(device)
        ? href.camera(device.id, tap.kind === 'call' ? 'call' : null)
        : href.device(device),
    );
  }, [response, store]);
  return null;
}
