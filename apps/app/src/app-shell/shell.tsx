import { useEffect, type ReactNode } from 'react';
import { Logger } from '@smarteverything/logging';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { usePrewarmChat } from '../features/assistant/screens/open-last-chat';
import { HeaderSearchProvider } from '../components/header-search';
import { HeaderStatusProvider } from '../components/header-status';
import { useColour } from '../design/colour';
import { useSizeClass } from '../design/size-class';
import { openSearch } from '../search/open-search';
import { AdaptiveNav } from './adaptive-nav';
import { screenPause } from './screen-pause';
import { GlobalHosts } from './global-hosts';
import { useNaturalTabForColdLinks } from './natural-tab';
import { useNavOrder } from './nav-layout';
import { NavSheetHost } from './nav-sheet';
import { ShellGate } from './shell-gate';
import { SyncIndicator } from './sync-indicator';
import { useTabPrewarm } from './tab-prewarm';
import { anchorTabRoots } from './tab-router';
import { useTabReplacement } from './tab-replacement-host';

const TABS = [
  '(home)',
  '(devices)',
  '(cameras)',
  '(fitness)',
  '(z-assistant)',
  '(automations)',
  '(talk)',
  '(settings)',
] as const;

const log = new Logger('app.nav');

const SYNC_INDICATOR = <SyncIndicator />;

function openHeaderSearch(): void {
  openSearch();
}

function TabPrewarm(props: BottomTabBarProps): ReactNode {
  useTabPrewarm({ ...props, chatOf: usePrewarmChat(), order: useNavOrder() });
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
  return null;
}

function ShellTabs(): ReactNode {
  const { nav } = useSizeClass();
  useEffect(() => {
    log.info('shell.mounted', { tabs: TABS.length });
    return (): void => {
      log.info('shell.unmounted');
    };
  }, []);
  const scene = { backgroundColor: useColour('bg') };
  return (
    <HeaderSearchProvider value={openHeaderSearch}>
      <HeaderStatusProvider value={SYNC_INDICATOR}>
        <Tabs
          tabBar={renderTabBar}
          backBehavior="none"
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
          {TABS.map((name) => (
            <Tabs.Screen key={name} name={name} />
          ))}
        </Tabs>
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
