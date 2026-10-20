import type { ReactNode, RefObject } from 'react';
import { useRef } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { anchorKey } from '../components/highlight-keys';
import { Interactive } from '../components/interactive';
import { useHighlightAnchor } from '../components/use-highlight-anchor';
import { BarFolderFace, folderLabelOf } from './bar-folder-face';
import type { NavEntry, NavFolderView, NavNodeView } from './nav-model';
import { NO_SLOT, holdOutcome } from './nav-bar-drag';
import { NavItem } from './nav-item';
import { useSlotDrag, type BarDrag, type SlotRelease } from './use-bar-drag';

export interface SlotAnchor {
  readonly node: NavNodeView;
  readonly ref: RefObject<View | null>;
}

export interface BarSlotProps {
  readonly node: NavNodeView;
  readonly slot: number;
  readonly drag: BarDrag;
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
  readonly onFolder: (anchor: SlotAnchor) => void;
  readonly onHold: (anchor: SlotAnchor) => void;
  readonly onMove: (release: SlotRelease) => void;
}

function FolderSlot({
  folder,
  onPress,
}: {
  readonly folder: NavFolderView;
  readonly onPress: () => void;
}): ReactNode {
  const anchor = useHighlightAnchor(anchorKey.nav(folder.key), folder.title);
  return (
    <View {...anchor} className="flex-1">
      <Interactive
        role="button"
        label={folderLabelOf(folder)}
        hint="Opens the folder"
        selected={folder.active}
        onPress={onPress}
        className="h-16 w-full items-center justify-center"
        layerClassName="rounded-full"
      >
        <BarFolderFace folder={folder} />
      </Interactive>
    </View>
  );
}

function SlotFace(props: BarSlotProps & { readonly anchor: SlotAnchor }): ReactNode {
  const { node, go, intent, onFolder, anchor } = props;
  if (node.kind === 'folder') {
    return (
      <FolderSlot
        folder={node}
        onPress={() => {
          onFolder(anchor);
        }}
      />
    );
  }
  return (
    <NavItem
      entry={node}
      look="bar"
      onPress={() => {
        go(node);
      }}
      onIntent={() => {
        intent(node);
      }}
    />
  );
}

function DropTarget({ drag, slot }: { readonly drag: BarDrag; readonly slot: number }): ReactNode {
  const style = useAnimatedStyle(() => ({ opacity: drag.armed.get() === slot ? 1 : 0 }));
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className="absolute inset-1 rounded-full bg-primary-container/60"
    />
  );
}

export function BarSlot(props: BarSlotProps): ReactNode {
  const { node, slot, drag, onHold, onMove } = props;
  const ref = useRef<View>(null);
  const anchor = { node, ref };
  const { gesture, style } = useSlotDrag(drag, slot, (release) => {
    const placed = release.to !== release.slot || release.into !== NO_SLOT;
    const outcome = holdOutcome(placed, release.moved);
    if (outcome === 'drop') onMove(release);
    else if (outcome === 'menu') onHold(anchor);
  });
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style} className="flex-1">
        <DropTarget drag={drag} slot={slot} />
        <View ref={ref} collapsable={false} className="flex-1">
          <SlotFace {...props} anchor={anchor} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
