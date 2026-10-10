import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { appPlatform } from '../design/platform';
import { AiCallHost, AiSpeechHost, AssistantPushHost, QuickAskHost } from '../features/assistant';
import { ScheduleSheetHost } from '../features/automations';
import { CallHost } from '../features/cameras';
import { ConsentHost } from '../features/connections';
import { QuickControlsHost } from '../features/devices';
import { EntryDeliveryHost } from '../features/health-log';
import { ScaleListenerHost, WhoWasThisHost } from '../features/profiles';
import { TalkHost } from '../features/talk';
import { WatchLinkHost } from '../features/watches';
import { SearchPopover } from '../search/search-popover';
import { useSyncStatus } from '../store/selectors';
import { NotificationTaps } from './notification-taps';
import { preloader } from './preloader';
import { ROUTES } from './routes';

function usePreloading(): void {
  const client = useQueryClient();
  const live = useSyncStatus().status === 'live';
  useEffect(() => {
    if (live) {
      preloader.start(ROUTES, client);
    }
  }, [live, client]);
}

export function GlobalHosts(): ReactNode {
  usePreloading();
  return (
    <>
      <SearchPopover />
      <QuickControlsHost />
      <ScheduleSheetHost />
      <CallHost />
      <ConsentHost />
      <WhoWasThisHost />
      <ScaleListenerHost />
      <TalkHost />
      {appPlatform() === 'desktop' || appPlatform() === 'web' ? <QuickAskHost /> : null}
      <AiCallHost />
      <AiSpeechHost />
      {appPlatform() === 'android' ? <AssistantPushHost /> : null}
      {appPlatform() === 'android' ? <EntryDeliveryHost /> : null}
      {appPlatform() === 'android' ? <WatchLinkHost /> : null}
      {appPlatform() === 'android' ? <NotificationTaps /> : null}
    </>
  );
}
