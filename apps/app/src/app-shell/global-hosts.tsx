import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { appPlatform } from '../design/platform';
import {
  AiCallHost,
  BrowserRuntimeHost,
  AiSpeechHost,
  AssistantPushHost,
  CallAudioSync,
  OutboxHost,
  OverlayHost,
  PhoneEarHost,
  QuickAskHost,
} from '../features/assistant';
import { ScheduleSheetHost } from '../features/automations';
import { CallHost } from '../features/cameras';
import { ClipboardSyncHost } from '../features/clipboard';
import { ConsentHost } from '../features/connections';
import { QuickControlsHost } from '../features/devices';
import { BackgroundAlertsHost, PushRegistrationHost } from '../features/settings';
import { HealthSyncHost } from '../features/fitness';
import { EntryDeliveryHost } from '../features/health-log';
import { ScaleListenerHost, WhoWasThisHost } from '../features/profiles';
import { TalkHost } from '../features/talk';
import { WatchLinkHost } from '../features/watches';
import { BottleLinkHost } from '../plugins/larq/data/link-host';
import { BrushLinkHost } from '../plugins/toothbrush/data/link-host';
import { TreadmillLinkHost } from '../plugins/treadmill/data/link-host';
import { PinPickerHost } from '../search/pin-picker';
import { SearchPopover } from '../search/search-popover';
import { useSyncStatus } from '../store/selectors';
import { HighlightHost } from '../components/highlight-host';
import { AppViewHost } from './app-view-host';
import { NotificationTaps } from './notification-taps';
import { preloader } from './preloader';
import { ROUTES } from './routes';

const log = new Logger('app.nav');

function usePreloading(): void {
  const client = useQueryClient();
  const live = useSyncStatus().status === 'live';
  useEffect(() => {
    log.debug('hosts.sync_live', { live });
    if (live) {
      preloader.start(ROUTES, client);
    }
  }, [live, client]);
}

function PhoneAlertHosts(): ReactNode {
  if (appPlatform() !== 'android') {
    return null;
  }
  return (
    <>
      <AssistantPushHost />
      <PushRegistrationHost />
      <BackgroundAlertsHost />
      <NotificationTaps />
    </>
  );
}

export function GlobalHosts(): ReactNode {
  usePreloading();
  useEffect(() => {
    log.info('hosts.mounted', { platform: appPlatform() });
    return (): void => {
      log.info('hosts.unmounted');
    };
  }, []);
  return (
    <>
      <BrowserRuntimeHost />
      <SearchPopover />
      <PinPickerHost />
      <QuickControlsHost />
      <ScheduleSheetHost />
      <CallHost />
      <ClipboardSyncHost />
      <ConsentHost />
      <WhoWasThisHost />
      <ScaleListenerHost />
      <TalkHost />
      {appPlatform() === 'desktop' || appPlatform() === 'web' ? <QuickAskHost /> : null}
      <AiCallHost />
      <CallAudioSync />
      <AiSpeechHost />
      <AppViewHost />
      <HighlightHost />
      <OverlayHost />
      <OutboxHost />
      <PhoneAlertHosts />
      {appPlatform() === 'android' ? <PhoneEarHost /> : null}
      {appPlatform() === 'android' ? <EntryDeliveryHost /> : null}
      {appPlatform() === 'android' ? <HealthSyncHost /> : null}
      {appPlatform() === 'android' ? <WatchLinkHost /> : null}
      {appPlatform() === 'android' ? <TreadmillLinkHost /> : null}
      {appPlatform() === 'android' ? <BrushLinkHost /> : null}
      {appPlatform() === 'android' ? <BottleLinkHost /> : null}
    </>
  );
}
