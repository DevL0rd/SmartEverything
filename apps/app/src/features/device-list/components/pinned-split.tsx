import { useState, type ReactNode } from 'react';
import { View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { IconButton } from '../../../components/icon-button';
import { VisualVisibility } from '../../../design/visibility';
import { usePinnedSplit } from '../../home-map';
import { pinnedStageStyle, shareAfterDrag, shareAfterStep } from '../model/map-split';

const DRAG_ACTIVATION = 4;

const SHARE_LABEL = 'Resize the home map';

interface HandleProps {
  readonly share: number;
  readonly height: number;
  readonly onDrag: (share: number) => void;
  readonly onResize: (share: number) => void;
  readonly onCollapse: () => void;
}

function Handle({ share, height, onDrag, onResize, onCollapse }: HandleProps): ReactNode {
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY([-DRAG_ACTIVATION, DRAG_ACTIVATION])
    .onUpdate((event) => {
      onDrag(shareAfterDrag(share, event.translationY, height));
    })
    .onEnd((event) => {
      onResize(shareAfterDrag(share, event.translationY, height));
    });
  const step = (event: AccessibilityActionEvent): void => {
    const name = event.nativeEvent.actionName;
    if (name === 'increment' || name === 'decrement') onResize(shareAfterStep(share, name));
    else if (name === 'activate') onCollapse();
  };
  return (
    <View className="flex-row items-center px-gutter">
      <GestureDetector gesture={drag}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={SHARE_LABEL}
          accessibilityValue={{ text: `${String(Math.round(share * 100))} percent` }}
          accessibilityHint="Drag to resize. Double tap to fold the map away."
          accessibilityActions={[
            { name: 'increment' },
            { name: 'decrement' },
            { name: 'activate' },
          ]}
          onAccessibilityAction={step}
          className="h-11 flex-1 items-center justify-center"
        >
          <View className="h-1 w-10 rounded-full bg-outline-variant" />
        </View>
      </GestureDetector>
      <IconButton icon="chevronUp" label="Fold the home map away" onPress={onCollapse} />
    </View>
  );
}

function FoldedBar({
  bar,
  onExpand,
}: {
  readonly bar: ReactNode;
  readonly onExpand: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2 border-b border-outline-variant bg-surface-1 px-gutter">
      <View className="min-w-0 flex-1">{bar}</View>
      <IconButton icon="chevronDown" label="Show the home map" onPress={onExpand} />
    </View>
  );
}

export interface PinnedSplitProps {
  readonly stage: ReactNode;
  readonly bar: ReactNode;
  readonly children: ReactNode;
}

function useHeight(): readonly [number, (event: LayoutChangeEvent) => void] {
  const [height, setHeight] = useState(0);
  return [
    height,
    (event): void => {
      setHeight(event.nativeEvent.layout.height);
    },
  ];
}

export function PinnedSplit({ stage, bar, children }: PinnedSplitProps): ReactNode {
  const { size, collapsed, setSize, setCollapsed } = usePinnedSplit();
  const [height, onLayout] = useHeight();
  const [dragged, setDragged] = useState<number | null>(null);
  const share = dragged ?? size;
  return (
    <View className="flex-1" onLayout={onLayout}>
      <View style={pinnedStageStyle(height, share, collapsed)} className="w-full overflow-hidden">
        <VisualVisibility visible={!collapsed && height > 0}>{stage}</VisualVisibility>
      </View>
      {collapsed ? (
        <FoldedBar
          bar={bar}
          onExpand={(): void => {
            setCollapsed(false);
          }}
        />
      ) : (
        <Handle
          share={size}
          height={height}
          onDrag={setDragged}
          onResize={(next): void => {
            setDragged(null);
            setSize(next);
          }}
          onCollapse={(): void => {
            setCollapsed(true);
          }}
        />
      )}
      <View className="min-h-0 flex-1">{children}</View>
    </View>
  );
}
