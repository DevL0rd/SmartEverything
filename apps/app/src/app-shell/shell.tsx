import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { usePathname } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { usePrewarmChat } from '../features/assistant/screens/open-last-chat';
import { APP_UPDATES_PATH, AppUpdateBanner } from '../features/app-updates';
import { HubUpdateBanner } from '../features/hub-updates';
import { HeaderSearchProvider } from '../components/header-search';
import { HeaderStatusProvider } from '../components/header-status';
import { UpdateDetailsFallbackFocus } from '../components/update-details-focus';
import { useColour } from '../design/colour';
import { isNative } from '../design/platform';
import { useSizeClass } from '../design/size-class';
import { openSearch } from '../search/open-search';
import { AdaptiveNav } from './adaptive-nav';
import { useBackOrigins } from './back-host';
import { screenPause } from './screen-pause';
import { GlobalHosts } from './global-hosts';
import { useNaturalTabForColdLinks } from './natural-tab';
import { useNavOrder, usePinLeaves } from './nav-layout';
import { NavSheetHost } from './nav-sheet';
import { PagePinHost } from './page-pin-host';
import { ShellGate } from './shell-gate';
import { SyncIndicator } from './sync-indicator';
import { TAB_NAMES } from './tab-names';
import { useTabPrewarm } from './tab-prewarm';
import { anchorTabRoots, shellTabBackBehavior } from './tab-router';
import { useTabReplacement } from './tab-replacement-host';

const log = new Logger('app.nav');

const SYNC_INDICATOR = <SyncIndicator />;

function openHeaderSearch(): void {
  openSearch();
}

function TabPrewarm(props: BottomTabBarProps): ReactNode {
  useTabPrewarm({
    ...props,
    chatOf: usePrewarmChat(),
    order: useNavOrder(),
    pins: usePinLeaves(),
  });
  return null;
}

function renderTabBar(props: BottomTabBarProps): ReactNode {
  return (
    <>
      <AdaptiveNav {...props} />
      <TabPrewarm {...props} />
    </>
  );
}

function NavigationEffects(): ReactNode {
  useNaturalTabForColdLinks();
  useTabReplacement();
  useBackOrigins();
  return null;
}

function ShellUpdateNotices(): ReactNode {
  const focus = useRef<View>(null);
  const onUpdatesPage = usePathname() === APP_UPDATES_PATH;
  return (
    <UpdateDetailsFallbackFocus value={focus}>
      <View
        ref={focus}
        tabIndex={-1}
        aria-label="Update notices"
        pointerEvents="box-none"
        className="shell-update-inset z-20 shrink-0 bg-chrome pt-safe"
      >
        <AppUpdateBanner offersHidden={onUpdatesPage} />
        {onUpdatesPage ? null : <HubUpdateBanner />}
      </View>
    </UpdateDetailsFallbackFocus>
  );
}

function ShellTabs(): ReactNode {
  const { nav } = useSizeClass();
  useEffect(() => {
    log.info('shell.mounted', { tabs: TAB_NAMES.length });
    return (): void => {
      log.info('shell.unmounted');
    };
  }, []);
  const scene = { backgroundColor: useColour('bg') };
  return (
    <HeaderSearchProvider value={openHeaderSearch}>
      <HeaderStatusProvider value={SYNC_INDICATOR}>
        <ShellUpdateNotices />
        <PagePinHost>
          <Tabs
            tabBar={renderTabBar}
            backBehavior={shellTabBackBehavior(isNative())}
            screenLayout={screenPause}
            UNSTABLE_router={anchorTabRoots}
            screenOptions={{
              headerShown: false,
              tabBarPosition: nav === 'bar' ? 'bottom' : 'left',
              lazy: true,
              freezeOnBlur: false,
              sceneStyle: scene,
            }}
          >
            {TAB_NAMES.map((name) => (
              <Tabs.Screen key={name} name={name} />
            ))}
          </Tabs>
        </PagePinHost>
        <NavigationEffects />
        {nav === 'bar' ? <NavSheetHost /> : null}
        <GlobalHosts />
      </HeaderStatusProvider>
    </HeaderSearchProvider>
  );
}

export function Shell(): ReactNode {
  return (
    <ShellGate>
      <ShellTabs />
    </ShellGate>
  );
}
