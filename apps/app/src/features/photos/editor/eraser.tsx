import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';
import type { PhotoPoint } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { Rect } from './geometry';
import { brushPx, erasedSummary, pointIn, type Stroke } from './eraser-model';
import { SliderHead } from './slider-head';
import type { PhotoEditor } from './use-photo-editor';

export interface EraserOverlayProps {
  readonly rect: Rect;
  readonly brush: number;
  readonly strokes: readonly Stroke[];
  readonly disabled: boolean;
  readonly onStroke: (stroke: Stroke) => void;
}

function pointsText(points: readonly PhotoPoint[], rect: Rect): string {
  return points
    .map((point) => `${String(point.x * rect.width)},${String(point.y * rect.height)}`)
    .join(' ');
}

export function EraserOverlay(props: EraserOverlayProps): ReactNode {
  const [live, setLive] = useState<readonly PhotoPoint[]>([]);
  const points = useSharedValue<readonly PhotoPoint[]>([]);
  const colour = useColour('primary');
  const size = props.brush / 100;
  const gesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .enabled(!props.disabled)
    .onStart((event) => {
      const first = [pointIn(props.rect, event.x, event.y)];
      points.set(first);
      setLive(first);
    })
    .onUpdate((event) => {
      const next = [...points.get(), pointIn(props.rect, event.x, event.y)];
      points.set(next);
      setLive(next);
    })
    .onEnd(() => {
      const stroke = points.get();
      if (stroke.length > 0) props.onStroke({ size, points: [...stroke] });
      points.set([]);
      setLive([]);
    });
  const drawn = [...props.strokes, ...(live.length > 0 ? [{ size, points: live }] : [])];
  return (
    <GestureDetector gesture={gesture}>
      <View className="absolute inset-0" accessible accessibilityLabel="Brush over what to remove">
        <Svg width={props.rect.width} height={props.rect.height}>
          {drawn.map((stroke, index) => (
            <Polyline
              key={index}
              points={pointsText(stroke.points, props.rect)}
              stroke={colour}
              strokeOpacity={0.55}
              strokeWidth={brushPx(stroke.size, props.rect)}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>
    </GestureDetector>
  );
}

export interface EraserPanelProps {
  readonly editor: PhotoEditor;
  readonly brush: number;
  readonly strokes: readonly Stroke[];
  readonly hasKey: boolean | null;
  readonly onBrush: (size: number) => void;
  readonly onUndoStroke: () => void;
  readonly onErase: () => void;
}

function NoKey(): ReactNode {
  return (
    <View className="mx-4 gap-2 rounded-lg bg-surface-2 p-4">
      <Text variant="label">The eraser needs an OpenRouter key</Text>
      <Text variant="callout" tone="variant">
        Erasing sends the brushed part of this photo to OpenRouter. Add a key in AI settings.
      </Text>
      <Button
        label="Open AI settings"
        icon="key"
        variant="tonal"
        href={href.settings.page('assistant')}
      />
    </View>
  );
}

function Erasing(): ReactNode {
  return (
    <View
      className="mx-4 min-h-touch-min flex-row items-center gap-3"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Erasing"
    >
      <ActivityIndicator colorClassName="accent-primary" />
      <Text variant="callout">Erasing the brushed area. This takes a few seconds.</Text>
    </View>
  );
}

export function EraserPanel(props: EraserPanelProps): ReactNode {
  if (props.hasKey === false) return <NoKey />;
  if (props.editor.erasing) return <Erasing />;
  return (
    <View className="gap-3">
      <Text variant="callout" tone="variant" className="px-4">
        {erasedSummary(props.editor.committed.patches.length)}
      </Text>
      <View className="gap-1 px-4">
        <SliderHead label="Brush size" value={`${String(props.brush)}%`} />
        <Slider
          label="Brush size"
          value={props.brush}
          min={1}
          max={100}
          step={1}
          formatValue={(value) => `${String(value)}%`}
          onCommit={props.onBrush}
        />
      </View>
      <View className="flex-row flex-wrap items-center gap-2 px-4">
        <Button
          label="Erase"
          icon="eraser"
          variant="filled"
          disabled={props.strokes.length === 0}
          onPress={props.onErase}
        />
        <Button
          label="Undo stroke"
          icon="undo"
          variant="text"
          disabled={props.strokes.length === 0}
          onPress={props.onUndoStroke}
        />
      </View>
    </View>
  );
}
