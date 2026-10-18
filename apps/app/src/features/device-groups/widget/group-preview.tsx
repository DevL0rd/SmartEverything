import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DotStrip, type Dot } from '../../../components/dot-strip';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { frameClassOf, WidgetSurface, type WidgetFrameBox } from '../../../components/widget-board';

const DEMO_DOTS: readonly Dot[] = [
  { key: 'a', colour: null, state: 'on' },
  { key: 'b', colour: null, state: 'on' },
  { key: 'c', colour: null, state: 'on' },
  { key: 'd', colour: null, state: 'off' },
  { key: 'e', colour: null, state: 'off' },
  { key: 'f', colour: null, state: 'offline' },
];
const DEMO_ROWS = 3;

function Band({ height }: { readonly height: string }): ReactNode {
  return (
    <View className={`${height} overflow-hidden rounded-md bg-surface-2`}>
      <View className="h-full w-3/5 bg-primary/30" />
    </View>
  );
}

function Heading({ lines }: { readonly lines: number }): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <IconWell icon="bulbGroup" colour="primary" size="s" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={lines}>
          Light group
        </Text>
        <Text variant="footnote" tone="primary" numberOfLines={1}>
          4 of 6 on
        </Text>
      </View>
    </View>
  );
}

function Rows(): ReactNode {
  return (
    <View className="gap-0.5">
      {Array.from({ length: DEMO_ROWS }, (_, index) => (
        <View key={index} className="h-10 rounded-md bg-surface-2" />
      ))}
    </View>
  );
}

export function GroupPreview({ frame }: { readonly frame: WidgetFrameBox }): ReactNode {
  const shape = frameClassOf(frame);
  const compact = shape === 's' || shape === 'xs';
  const tall = shape === 'l' || shape === 'xl';
  return (
    <WidgetSurface>
      <View className="flex-1 justify-between gap-1.5 p-card-pad" pointerEvents="none">
        <Heading lines={compact ? 2 : 1} />
        {compact ? null : <Band height="h-10" />}
        {tall ? <Rows /> : <DotStrip dots={DEMO_DOTS} />}
      </View>
    </WidgetSurface>
  );
}
