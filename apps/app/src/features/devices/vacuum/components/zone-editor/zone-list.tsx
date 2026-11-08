import type { Dispatch, ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../../../components/icon-button';
import type { IconName } from '../../../../../components/icon';
import { Interactive } from '../../../../../components/interactive';
import { NumberStepper } from '../../../../../components/number-stepper';
import { Text } from '../../../../../components/text';
import { cn } from '../../../../../design/cn';
import { resizeRectTo, sizeOf, sizeText, type Bounds, type Direction } from './zone-geometry';
import { nudgeStep, type ZoneView } from './zone-frame';
import type { ZoneAction } from './zone-reducer';
import { KIND_LABEL, cleanShapes, type Draft, type RectShape, type Shape } from './zone-shapes';

const MOVES: readonly { readonly direction: Direction; readonly icon: IconName }[] = [
  { direction: 'left', icon: 'arrowLeft' },
  { direction: 'up', icon: 'arrowUp' },
  { direction: 'down', icon: 'arrowDown' },
  { direction: 'right', icon: 'arrowRight' },
];

const STEP_METRES = 0.1;

const MIN_METRES = 0.2;

function titleOf(draft: Draft, shape: Shape): string {
  if (shape.kind !== 'clean') return KIND_LABEL[shape.kind];
  const order = cleanShapes(draft).findIndex((candidate) => candidate.key === shape.key) + 1;
  return `${KIND_LABEL.clean} ${String(order)}`;
}

function Row({
  draft,
  shape,
  selected,
  dispatch,
}: {
  readonly draft: Draft;
  readonly shape: Shape;
  readonly selected: boolean;
  readonly dispatch: Dispatch<ZoneAction>;
}): ReactNode {
  const title = titleOf(draft, shape);
  return (
    <View
      className={cn(
        'min-h-touch-min flex-row items-center gap-2 rounded-md pl-3',
        selected && 'bg-primary-container',
      )}
    >
      <Interactive
        label={`${title}, ${sizeText(shape)}`}
        selected={selected}
        className="min-h-touch-min min-w-0 flex-1 justify-center"
        onPress={() => {
          dispatch({ type: 'select', key: selected ? null : shape.key });
        }}
      >
        <Text variant="body-strong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
          {sizeText(shape)}
        </Text>
      </Interactive>
      <IconButton
        icon="trash"
        label={`Remove ${title}`}
        tone="critical"
        onPress={() => {
          dispatch({ type: 'remove', key: shape.key });
        }}
      />
    </View>
  );
}

function Steppers({
  shape,
  bounds,
  dispatch,
}: {
  readonly shape: RectShape;
  readonly bounds: Bounds;
  readonly dispatch: Dispatch<ZoneAction>;
}): ReactNode {
  const { width, height } = sizeOf(shape);
  const resize = (nextWidth: number, nextHeight: number): void => {
    dispatch({
      type: 'replace',
      shape: { ...shape, rect: resizeRectTo(shape.rect, nextWidth, nextHeight, bounds) },
    });
  };
  return (
    <View className="gap-2">
      <NumberStepper
        label="Width"
        value={width}
        min={MIN_METRES}
        max={bounds.maxX - bounds.minX}
        step={STEP_METRES}
        unit="m"
        onChange={(next) => {
          resize(next, height);
        }}
      />
      <NumberStepper
        label="Height"
        value={height}
        min={MIN_METRES}
        max={bounds.maxY - bounds.minY}
        step={STEP_METRES}
        unit="m"
        onChange={(next) => {
          resize(width, next);
        }}
      />
    </View>
  );
}

function Controls({
  shape,
  bounds,
  view,
  dispatch,
}: {
  readonly shape: Shape;
  readonly bounds: Bounds;
  readonly view: ZoneView;
  readonly dispatch: Dispatch<ZoneAction>;
}): ReactNode {
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      {shape.form === 'rect' ? (
        <Steppers shape={shape} bounds={bounds} dispatch={dispatch} />
      ) : null}
      {shape.form === 'fixed' ? (
        <Text variant="footnote" tone="variant">
          This area is rotated on the robot. It can be moved only by removing it and drawing a new
          one.
        </Text>
      ) : (
        <View className="flex-row items-center justify-between">
          {MOVES.map((move) => (
            <IconButton
              key={move.direction}
              icon={move.icon}
              label={`Move ${move.direction} by 0.1 metres`}
              variant="tonal"
              onPress={() => {
                dispatch({
                  type: 'nudge',
                  key: shape.key,
                  step: nudgeStep(view, move.direction),
                  bounds,
                });
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function ZoneList({
  draft,
  selected,
  bounds,
  view,
  dispatch,
}: {
  readonly draft: Draft;
  readonly selected: number | null;
  readonly bounds: Bounds;
  readonly view: ZoneView;
  readonly dispatch: Dispatch<ZoneAction>;
}): ReactNode {
  const chosen = draft.find((shape) => shape.key === selected);
  if (draft.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        No zones or restricted areas yet. Pick a type and add one.
      </Text>
    );
  }
  return (
    <View accessibilityRole="list" className="gap-1">
      {draft.map((shape) => (
        <Row
          key={shape.key}
          draft={draft}
          shape={shape}
          selected={shape.key === selected}
          dispatch={dispatch}
        />
      ))}
      {chosen === undefined ? null : (
        <Controls shape={chosen} bounds={bounds} view={view} dispatch={dispatch} />
      )}
    </View>
  );
}
