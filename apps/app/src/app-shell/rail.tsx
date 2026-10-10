import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useToastObstacle } from '../components/toast-obstacles';
import { cn } from '../design/cn';
import { useSizeClass } from '../design/size-class';
import type { NavViewProps } from './bottom-bar';
import { NavItem } from './nav-item';
import type { NavEntry } from './nav-model';

export function Rail({
  model,
  go,
  intent,
  collapsed = false,
  header,
}: NavViewProps & { readonly collapsed?: boolean; readonly header?: ReactNode }): ReactNode {
  const dense = useSizeClass().height === 'compact';
  const { attach, onLayout } = useToastObstacle('start');
  const look = collapsed ? 'collapsed' : dense ? 'rail-dense' : 'rail';
  const item = (entry: NavEntry): ReactNode => (
    <NavItem
      key={entry.route.key}
      entry={entry}
      look={look}
      onPress={() => {
        go(entry);
      }}
      onIntent={() => {
        intent(entry);
      }}
    />
  );
  return (
    <View
      ref={attach}
      onLayout={onLayout}
      className="flex-row border-r border-outline-variant bg-chrome pl-safe"
    >
      <View
        accessibilityRole="menu"
        accessibilityLabel="Main"
        className={cn(
          dense ? 'pb-safe pt-safe' : 'pb-safe-offset-3 pt-safe-offset-3',
          collapsed ? 'w-rail-collapsed' : 'w-rail',
        )}
      >
        {header}
        <ScrollView contentContainerClassName={dense ? 'gap-0' : 'gap-1 pt-2'}>
          {model.pages.map(item)}
        </ScrollView>
        <View>{model.system.map(item)}</View>
      </View>
    </View>
  );
}
