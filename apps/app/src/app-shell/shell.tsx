import type { ReactNode } from 'react';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { HeaderSearchProvider } from '../components/header-search';
import { HeaderStatusProvider } from '../components/header-status';
import { useColour } from '../design/colour';
import { useSizeClass } from '../design/size-class';
import { openSearch } from '../search/open-search';
import { AdaptiveNav } from './adaptive-nav';
import { screenPause } from './screen-pause';
import { GlobalHosts } from './global-hosts';
import { useNaturalTabForColdLinks } from './natural-tab';
import { NavSheetHost } from './nav-sheet';
import { ShellGate } from './shell-gate';
import { SyncIndicator } from './sync-indicator';
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

const SYNC_INDICATOR = <SyncIndicator />;

function openHeaderSearch(): void {
  openSearch();
}

function renderTabBar(props: BottomTabBarProps): ReactNode {
  return <AdaptiveNav {...props} />;
}

function ShellTabs(): ReactNode {
  useNaturalTabForColdLinks();
  useTabReplacement();
  const { nav } = useSizeClass();
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
