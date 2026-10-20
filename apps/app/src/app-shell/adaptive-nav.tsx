import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import type { TextInput } from 'react-native';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { IconButton } from '../components/icon-button';
import { modifierLabel } from '../design/platform';
import { setSidebarCollapsed, useSizeClass } from '../design/size-class';
import { setLocalPref, useLocalPref } from '../store/local-prefs';
import { RailSearch } from '../search/rail-search';
import type { EntityStore } from '../store/entity-store';
import { useEntityStore } from '../store/store-context';
import { atStackRoot, useTabRootBack } from './back-handler';
import { BottomBar } from './bottom-bar';
import { confirmRemoveMissing } from './nav-edit-actions';
import { NavEditorHost } from './nav-editor-host';
import { useNavigationWriter, type NavigationWriter } from './nav-layout';
import {
  leafEntries,
  routeNameOfTab,
  tabOfRouteName,
  type NavEntry,
  type NavModel,
  type NavPinEntry,
  type NavSectionEntry,
} from './nav-model';
import { useNavigationHidden } from './nav-visibility';
import { navIntent as intent } from './nav-groups';
import { bindNavGo, navShown } from './nav-sheet-state';
import { noteLeafOpened } from './pin-prewarm';
import { pinLeafOf } from './pin-leaves';
import { Rail } from './rail';
import type { TabKey } from './route-types';
import { ShellShortcuts } from './shell-shortcuts';
import { Sidebar } from './sidebar';
import { hasSettingsOrigin } from './settings-navigation';
import { popTabToRoot } from './tab-router';
import { useNavModel } from './use-nav-model';

function goToSection(entry: NavSectionEntry, { state, navigation }: BottomTabBarProps): void {
  const target = state.routes.find((route) => route.name === routeNameOfTab(entry.tab));
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
    if (entry.tab === 'settings') router.replace(entry.href);
    return;
  }
  navigation.navigate(target.name);
}

function goToPin(entry: NavPinEntry, store: EntityStore, writer: NavigationWriter): void {
  if (entry.missing || entry.href === null) {
    confirmRemoveMissing(entry.key, store, writer);
    return;
  }
  const leaf = pinLeafOf(entry.node.pin.target);
  if (leaf !== null) noteLeafOpened(leaf.id);
  router.navigate(leaf?.href ?? entry.href, { withAnchor: true });
}

function useGo(props: BottomTabBarProps): (entry: NavEntry) => void {
  const store = useEntityStore();
  const writer = useNavigationWriter();
  return (entry) => {
    if (entry.kind === 'pin') goToPin(entry, store, writer);
    else goToSection(entry, props);
  };
}

function useBack(
  props: BottomTabBarProps,
  current: TabKey,
  entries: readonly NavEntry[],
  go: (entry: NavEntry) => void,
): void {
  const focused = props.state.routes[props.state.index];
  useTabRootBack({
    atTabRoot: atStackRoot(focused?.state) && !hasSettingsOrigin(props.state),
    onHome: current === 'home',
    goHome: () => {
      const home = entries.find((entry) => entry.tab === 'home');
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
    <Rail
      model={model}
      go={go}
      intent={intent}
      editable
      header={chromeSearch ? <RailSearch /> : null}
    />
  );
}

export function AdaptiveNav(props: BottomTabBarProps): ReactNode {
  const { nav, idiom } = useSizeClass();
  const collapsed = useLocalPref('sidebarCollapsed');
  const hidden = useNavigationHidden();
  const searchRef = useRef<TextInput>(null);
  const routeTab = tabOfRouteName(props.state.routes[props.state.index]?.name ?? '') ?? 'home';
  const model = useNavModel(routeTab);
  const go = useGo(props);
  useEffect(() => bindNavGo(go), [go]);
  useEffect(() => {
    navShown.set(model);
  }, [model]);
  const entries = leafEntries(model.nodes);
  const pointerCollapsed = collapsed && idiom === 'pointer';
  useEffect(() => {
    setSidebarCollapsed(pointerCollapsed);
  }, [pointerCollapsed]);
  const toggle = (): void => {
    setLocalPref('sidebarCollapsed', !collapsed);
  };
  useBack(props, routeTab, entries, go);
  if (nav === 'bar') {
    return (
      <>
        {hidden ? null : <BottomBar model={model} go={go} intent={intent} />}
        <NavEditorHost />
      </>
    );
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
      <ShellShortcuts searchRef={searchRef} model={model} go={go} toggleSidebar={toggle} />
      {chrome}
      <NavEditorHost />
    </>
  );
}
