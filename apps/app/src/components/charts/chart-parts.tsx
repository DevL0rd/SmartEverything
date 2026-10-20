import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { G, Line } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { selectionTick } from '../../platform/haptics';
import { Icon } from '../icon';
import { Text } from '../text';
import { LONG_PRESS_MS, READOUT_W, type ChartSeries, type Model } from './chart-model';
import { clamp, type Hit } from './scale';

export function Grid({ model }: { readonly model: Model }): ReactNode {
  const stroke = useColour('outline-variant');
  return (
    <G>
      {model.yTicks.map((tick) => (
        <Line
          key={tick}
          x1={model.box.left}
          x2={model.box.right}
          y1={model.y(tick)}
          y2={model.y(tick)}
          stroke={stroke}
          strokeWidth={1}
        />
      ))}
    </G>
  );
}

export type ScrubModel = Pick<Model, 'box' | 'x'>;

export function Crosshair({
  hits,
  model,
}: {
  readonly hits: readonly Hit<ChartSeries>[];
  readonly model: ScrubModel;
}): ReactNode {
  const stroke = useColour('on-surface-variant');
  const at = hits[0] === undefined ? null : model.x(hits[0].point.t);
  return (
    <G>
      {at === null ? null : (
        <Line
          x1={at}
          x2={at}
          y1={model.box.top}
          y2={model.box.bottom}
          stroke={stroke}
          strokeWidth={1}
        />
      )}
    </G>
  );
}

export function Readout({
  hits,
  model,
  heading,
  valueOf,
}: {
  readonly hits: readonly Hit<ChartSeries>[];
  readonly model: ScrubModel;
  readonly heading: string;
  readonly valueOf: (hit: Hit<ChartSeries>) => string;
}): ReactNode {
  const first = hits[0];
  if (first === undefined) {
    return null;
  }
  const at = model.x(first.point.t);
  const left = at > (model.box.left + model.box.right) / 2 ? at - 12 - READOUT_W : at + 12;
  const place = {
    left: clamp(left, { min: 0, max: model.box.width - READOUT_W }),
    top: model.box.top,
  };
  return (
    <View
      pointerEvents="none"
      style={place}
      className="absolute w-36 gap-0.5 rounded-sm border border-outline-variant bg-surface-raised px-2 py-1.5 elevation-2"
    >
      <Text variant="caption" tone="variant" className="tabular">
        {heading}
      </Text>
      {hits.map((hit) => (
        <View key={hit.series.label} className="flex-row items-center gap-1.5">
          <Icon name="circle" size={16} colour={hit.series.colour} />
          <Text variant="caption" numberOfLines={1} className="flex-1">
            {hit.series.label}
          </Text>
          <Text variant="caption" className="tabular">
            {valueOf(hit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export interface ScrubPoint {
  readonly x: number;
  readonly y: number;
}

export function scrubGesture(
  pointer: boolean,
  set: (point: ScrubPoint | null) => void,
): ReturnType<typeof Gesture.Hover> | ReturnType<typeof Gesture.Pan> {
  const clear = (): void => {
    set(null);
  };
  if (pointer) {
    return Gesture.Hover()
      .runOnJS(true)
      .onBegin((event) => {
        set({ x: event.x, y: event.y });
      })
      .onUpdate((event) => {
        set({ x: event.x, y: event.y });
      })
      .onFinalize(clear);
  }
  return Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart((event) => {
      selectionTick();
      set({ x: event.x, y: event.y });
    })
    .onUpdate((event) => {
      set({ x: event.x, y: event.y });
    })
    .onFinalize(clear);
}
