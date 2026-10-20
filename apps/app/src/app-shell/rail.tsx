import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useToastObstacle } from '../components/toast-obstacles';
import { cn } from '../design/cn';
import { useSizeClass } from '../design/size-class';
import type { NavViewProps } from './bottom-bar';
import { NavItem } from './nav-item';
import type { NavEntry } from './nav-model';
import { RailFolder } from './rail-folder';
import { RailList, type RailLook } from './rail-list';

function RailEntry({
  entry,
  look,
  go,
  intent,
}: {
  readonly entry: NavEntry;
  readonly look: RailLook;
  readonly go: NavViewProps['go'];
  readonly intent: NavViewProps['intent'];
}): ReactNode {
  return (
    <NavItem
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
}

function StaticRailList({
  model,
  go,
  intent,
  look,
}: NavViewProps & { readonly look: RailLook }): ReactNode {
  return (
    <ScrollView contentContainerClassName={look === 'rail-dense' ? 'gap-0' : 'gap-1 pt-2'}>
      {model.nodes.map((view) =>
        view.kind === 'folder' ? (
          <RailFolder key={view.key} folder={view} look={look} go={go} intent={intent} />
        ) : (
          <RailEntry key={view.key} entry={view} look={look} go={go} intent={intent} />
        ),
      )}
    </ScrollView>
  );
}

export function Rail({
  model,
  go,
  intent,
  collapsed = false,
  editable = false,
  header,
}: NavViewProps & {
  readonly collapsed?: boolean;
  readonly editable?: boolean;
  readonly header?: ReactNode;
}): ReactNode {
  const dense = useSizeClass().height === 'compact';
  const { attach, onLayout } = useToastObstacle('start');
  const look = collapsed ? 'collapsed' : dense ? 'rail-dense' : 'rail';
  const List = editable ? RailList : StaticRailList;
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
        <List model={model} go={go} intent={intent} look={look} />
        <View>
          {model.system.map((item) => (
            <RailEntry key={item.key} entry={item} look={look} go={go} intent={intent} />
          ))}
        </View>
      </View>
    </View>
  );
}
