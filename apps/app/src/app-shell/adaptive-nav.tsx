import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import type { TextInput } from 'react-native';
import { usePathname } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { IconButton } from '../components/icon-button';
import { modifierLabel } from '../design/platform';
import { useSizeClass } from '../design/size-class';
import { setLocalPref, useLocalPref } from '../store/local-prefs';
import { RailSearch } from '../search/rail-search';
import { useAvailability } from '../store/selectors';
import { atStackRoot, useTabRootBack } from './back-handler';
import { BottomBar } from './bottom-bar';
import { navEntries, navModel, tabOfRouteName, type NavEntry, type NavModel } from './nav-model';
import { useNavigationHidden } from './nav-visibility';
import { navIntent as intent } from './nav-groups';
import { bindNavGo, navCurrent } from './nav-sheet-state';
import { Rail } from './rail';
import type { TabKey } from './route-types';
import { ShellShortcuts } from './shell-shortcuts';
import { Sidebar } from './sidebar';
import { popTabToRoot } from './tab-router';

function useGo({ state, navigation }: BottomTabBarProps): (entry: NavEntry) => void {
  return (entry) => {
    const target = state.routes.find((route) => route.name === `(${entry.route.tab})`);
    if (target === undefined) {
      return;
    }
    const focused = state.routes[state.index]?.key === target.key;
    const event = navigation.emit({
      type: 'tabPress',
      target: target.key,
      canPreventDefault: true,
    });
    if (event.defaultPrevented) {
      return;
    }
    if (focused) {
      popTabToRoot(target, (action) => {
        navigation.dispatch(action);
      });
      return;
    }
    navigation.navigate(target.name);
  };
}

function shownTab(tab: TabKey, pathname: string): TabKey {
  if (tab !== 'more') {
    return tab;
  }
  if (pathname.startsWith('/settings')) {
    return 'settings';
  }
  if (pathname.startsWith('/talk')) {
    return 'talk';
  }
  return pathname.startsWith('/automations') ? 'automations' : 'more';
}

function useBack(
  props: BottomTabBarProps,
  current: TabKey,
  entries: readonly NavEntry[],
  go: (entry: NavEntry) => void,
): void {
  const focused = props.state.routes[props.state.index];
  useTabRootBack({
    atTabRoot: atStackRoot(focused?.state),
    onHome: current === 'home',
    goHome: () => {
      const home = entries.find((entry) => entry.route.tab === 'home');
      if (home !== undefined) {
        go(home);
      }
    },
  });
}

interface ChromeProps {
  readonly model: NavModel;
  readonly go: (entry: NavEntry) => void;
  readonly searchRef: RefObject<TextInput | null>;
  readonly collapsed: boolean;
  readonly toggle: () => void;
}

function PointerChrome({ model, go, searchRef, collapsed, toggle }: ChromeProps): ReactNode {
  if (!collapsed) {
    return (
      <Sidebar model={model} go={go} intent={intent} searchRef={searchRef} onCollapse={toggle} />
    );
  }
  return (
    <Rail
      model={model}
      go={go}
      intent={intent}
      collapsed
      header={
        <>
          <IconButton
            icon="panelLeft"
            label="Expand sidebar"
            shortcut={`${modifierLabel()} B`}
            onPress={toggle}
          />
          <RailSearch />
        </>
      }
    />
  );
}

function TouchRail({
  model,
  go,
}: {
  readonly model: NavModel;
  readonly go: (entry: NavEntry) => void;
}): ReactNode {
  const { chromeSearch } = useSizeClass();
  return (
    <Rail model={model} go={go} intent={intent} header={chromeSearch ? <RailSearch /> : null} />
  );
}

export function AdaptiveNav(props: BottomTabBarProps): ReactNode {
  const { nav, idiom } = useSizeClass();
  const availability = useAvailability();
  const collapsed = useLocalPref('sidebarCollapsed');
  const hidden = useNavigationHidden();
  const pathname = usePathname();
  const searchRef = useRef<TextInput>(null);
  const routeTab = tabOfRouteName(props.state.routes[props.state.index]?.name ?? '') ?? 'home';
  const shown = shownTab(routeTab, pathname);
  const current = nav === 'bar' ? routeTab : shown;
  const model = navModel(nav, current, availability);
  const go = useGo(props);
  useEffect(() => bindNavGo(go), [go]);
  useEffect(() => {
    navCurrent.set(shown);
  }, [shown]);
  const entries = navEntries(model);
  const pointerCollapsed = collapsed && idiom === 'pointer';
  const toggle = (): void => {
    setLocalPref('sidebarCollapsed', !collapsed);
  };
  useBack(props, routeTab, entries, go);
  if (nav === 'bar') {
    return hidden ? null : <BottomBar model={model} go={go} intent={intent} />;
  }
  const chrome =
    nav === 'sidebar' ? (
      <PointerChrome
        model={model}
        go={go}
        searchRef={searchRef}
        collapsed={pointerCollapsed}
        toggle={toggle}
      />
    ) : (
      <TouchRail model={model} go={go} />
    );
  return (
    <>
      <ShellShortcuts searchRef={searchRef} entries={entries} go={go} toggleSidebar={toggle} />
      {chrome}
    </>
  );
}
