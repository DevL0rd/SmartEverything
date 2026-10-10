import type { ReactNode } from 'react';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { HeaderSearchProvider } from '../components/header-search';
import { useColour } from '../design/colour';
import { useSizeClass } from '../design/size-class';
import { openSearch } from '../search/open-search';
import { AdaptiveNav } from './adaptive-nav';
import { GlobalHosts } from './global-hosts';
import { useNaturalTabForColdLinks } from './natural-tab';
import { NavSheetHost } from './nav-sheet';
import { ShellGate } from './shell-gate';
import { SyncBanner } from './sync-indicator';
import { anchorTabRoots } from './tab-router';

const TABS = [
  '(home)',
  '(devices)',
  '(cameras)',
  '(fitness)',
  '(assistant)',
  '(automations)',
  '(talk)',
  '(settings)',
  '(more)',
] as const;

function openHeaderSearch(): void {
  openSearch();
}

function renderTabBar(props: BottomTabBarProps): ReactNode {
  return <AdaptiveNav {...props} />;
}

function ShellTabs(): ReactNode {
  useNaturalTabForColdLinks();
  const { nav } = useSizeClass();
  const scene = { backgroundColor: useColour('bg') };
  return (
    <HeaderSearchProvider value={openHeaderSearch}>
      {nav === 'bar' ? <SyncBanner /> : null}
      <Tabs
        tabBar={renderTabBar}
        backBehavior="none"
        UNSTABLE_router={anchorTabRoots}
        screenOptions={{
          headerShown: false,
          tabBarPosition: nav === 'bar' ? 'bottom' : 'left',
          lazy: true,
          freezeOnBlur: true,
          sceneStyle: scene,
        }}
      >
        {TABS.map((name) => (
          <Tabs.Screen key={name} name={name} />
        ))}
      </Tabs>
      {nav === 'bar' ? <NavSheetHost /> : null}
      <GlobalHosts />
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
