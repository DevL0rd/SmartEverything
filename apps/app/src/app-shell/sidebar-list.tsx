import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { Drop } from './nav-drag';
import { Text } from '../components/text';
import type { NavViewProps } from './bottom-bar';
import { useNavEdits } from './nav-edit-actions';
import { navEditor } from './nav-edit-state';
import { navRows } from './nav-rows';
import { SidebarRow } from './sidebar-row';
import { useNavDrag } from './use-nav-drag';

export function DropLine({ drop }: { readonly drop: Drop | null }): ReactNode {
  const shown = drop !== null && drop.into === null;
  const top = shown ? drop.line - 1 : 0;
  const style = useAnimatedStyle(() => ({ top }), [top]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className="absolute inset-x-3 h-0.5 rounded-full bg-primary"
    />
  );
}

function NavigationHeader(): ReactNode {
  return (
    <View className="px-4 pb-1">
      <Text variant="caption" tone="faint">
        Navigation
      </Text>
    </View>
  );
}

export function SidebarList({ model, go, intent }: NavViewProps): ReactNode {
  const edits = useNavEdits();
  const rows = navRows(model.nodes, false);
  const drag = useNavDrag(rows, edits.place, edits.foldInto);
  const folders = rows.flatMap((row) =>
    row.kind === 'folder' ? [{ key: row.key, title: row.folder.title }] : [],
  );
  return (
    <>
      <NavigationHeader />
      <ScrollView className="flex-1">
        <View>
          {rows.map((row) => (
            <SidebarRow
              key={row.key}
              row={row}
              rows={rows}
              drag={drag}
              edits={edits}
              folders={folders}
              go={go}
              intent={intent}
              openEditor={navEditor.set}
            />
          ))}
          <DropLine drop={drag.drop} />
        </View>
      </ScrollView>
    </>
  );
}
