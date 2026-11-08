import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as Platform from '../design/platform';

const hosts = vi.hoisted(() => ({
  none: (): null => null,
  platform: { current: 'android' },
}));

vi.mock('../features/models', async () => {
  const { createElement: make } = await import('react');
  return {
    BakeHost: (): ReactNode => make('i', { 'data-host': 'bake' }),
    LiveSurfaceHost: hosts.none,
  };
});

vi.mock('../features/assistant', () => ({
  AiCallHost: hosts.none,
  BrowserRuntimeHost: hosts.none,
  AiSpeechHost: hosts.none,
  AssistantPushHost: hosts.none,
  CallAudioSync: hosts.none,
  OutboxHost: hosts.none,
  OverlayHost: hosts.none,
  PhoneEarHost: hosts.none,
  QuickAskHost: hosts.none,
}));
vi.mock('../features/app-updates', () => ({ AppUpdateHost: hosts.none }));
vi.mock('../features/automations', () => ({ ScheduleSheetHost: hosts.none }));
vi.mock('../features/cameras', () => ({ CallHost: hosts.none }));
vi.mock('../features/clipboard', () => ({ ClipboardSyncHost: hosts.none }));
vi.mock('../features/connections', () => ({ ConsentHost: hosts.none }));
vi.mock('../features/devices', () => ({ QuickControlsHost: hosts.none }));
vi.mock('../features/settings', () => ({
  BackgroundAlertsHost: hosts.none,
  PushRegistrationHost: hosts.none,
}));
vi.mock('../features/fitness', () => ({ HealthSyncHost: hosts.none }));
vi.mock('../features/health-log', () => ({ EntryDeliveryHost: hosts.none }));
vi.mock('../features/profiles', () => ({
  ScaleListenerHost: hosts.none,
  WhoWasThisHost: hosts.none,
}));
vi.mock('../features/talk', () => ({ TalkHost: hosts.none }));
vi.mock('../features/watches', () => ({ WatchLinkHost: hosts.none }));
vi.mock('../plugins/larq/data/link-host', () => ({ BottleLinkHost: hosts.none }));
vi.mock('../plugins/toothbrush/data/link-host', () => ({ BrushLinkHost: hosts.none }));
vi.mock('../plugins/treadmill/data/link-host', () => ({ TreadmillLinkHost: hosts.none }));
vi.mock('../search/pin-picker', () => ({ PinPickerHost: hosts.none }));
vi.mock('../search/search-popover', () => ({ SearchPopover: hosts.none }));
vi.mock('../components/highlight-host', () => ({ HighlightHost: hosts.none }));
vi.mock('./app-view-host', () => ({ AppViewHost: hosts.none }));
vi.mock('./notification-taps', () => ({ NotificationTaps: hosts.none }));
vi.mock('./preloader', () => ({ preloader: { start: hosts.none } }));
vi.mock('./routes', () => ({ ROUTES: [] }));
vi.mock('../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({ status: 'connecting' }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: (): object => ({}) }));
vi.mock('../design/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof Platform>()),
  appPlatform: (): string => hosts.platform.current,
}));

const { GlobalHosts } = await import('./global-hosts');

describe('the global hosts', () => {
  it.each(['android', 'desktop', 'web'])('mount the model baker once on %s', (name) => {
    hosts.platform.current = name;
    const markup = renderToStaticMarkup(createElement(GlobalHosts));
    expect(markup.split('data-host="bake"').length - 1).toBe(1);
  });
});
