import type { ReactNode, RefObject } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import { router } from 'expo-router';
import { IconButton } from '../components/icon-button';
import { OverflowButton } from '../components/menu';
import { Text } from '../components/text';
import { useToastObstacle } from '../components/toast-obstacles';
import { modifierLabel } from '../design/platform';
import { SidebarSearch } from '../search/sidebar-search';
import { useSettings } from '../store/selectors';
import type { NavViewProps } from './bottom-bar';
import { HOME_ACTIONS } from './home-actions';
import { NavItems } from './nav-groups';
import { SyncRow } from './sync-indicator';

const HOME_MENU = HOME_ACTIONS.map((action) => ({
  label: action.label,
  icon: action.icon,
  onPress: (): void => {
    router.push(action.href);
  },
}));

function HomeHeader({ onCollapse }: { readonly onCollapse: () => void }): ReactNode {
  const settings = useSettings();
  return (
    <View className="flex-row items-center gap-1 pl-3">
      <Text variant="title-3" numberOfLines={1} className="flex-1">
        {settings.home_name}
      </Text>
      <OverflowButton label="Home menu" items={HOME_MENU} />
      <IconButton
        icon="panelLeft"
        label="Collapse sidebar"
        shortcut={`${modifierLabel()} B`}
        onPress={onCollapse}
      />
    </View>
  );
}

export interface SidebarProps extends NavViewProps {
  readonly searchRef: RefObject<TextInput | null>;
  readonly onCollapse: () => void;
}

export function Sidebar({ model, go, intent, searchRef, onCollapse }: SidebarProps): ReactNode {
  const { attach, onLayout } = useToastObstacle('start');
  return (
    <View
      ref={attach}
      onLayout={onLayout}
      accessibilityRole="menu"
      accessibilityLabel="Main"
      className="w-sidebar gap-3 border-r border-outline-variant bg-chrome px-3 pb-safe-offset-3 pt-safe-offset-3"
    >
      <HomeHeader onCollapse={onCollapse} />
      <SidebarSearch inputRef={searchRef} />
      <ScrollView className="flex-1" contentContainerClassName="gap-0.5">
        <NavItems entries={model.pages} go={go} intent={intent} />
      </ScrollView>
      <View className="gap-1">
        <NavItems entries={model.system} go={go} intent={intent} />
        <SyncRow />
      </View>
    </View>
  );
}
