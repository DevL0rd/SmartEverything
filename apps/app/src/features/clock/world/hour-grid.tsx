import { useState, type ReactNode } from 'react';
import { View, type AccessibilityActionEvent, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useHour24, useInstantClock } from '../../../store/clock-format';
import { selectionTick } from '../../../platform/haptics';
import type { WorldCity } from './cities';
import { percentOf } from './percent';
import {
  DAY_HOURS,
  hourCellsOf,
  hourShiftedBy,
  instantAt,
  minutePastOf,
  type HomeDay,
  type HourCell,
  type HourPlan,
  type HourTone,
} from './find-a-time';

const CELL_TONE: Readonly<Record<HourTone, string>> = {
  work: 'bg-primary-container',
  day: 'bg-surface-3',
  night: 'bg-bg',
};

const SLIM_TONE: Readonly<Record<HourTone, string>> = {
  work: 'bg-primary/40',
  day: 'bg-surface-3',
  night: 'bg-surface-2',
};

const LABEL_EVERY_CELL = 28;

const SPARSE_LABEL_STEP = 3;

const LABEL_TONE: Readonly<Record<HourTone, string>> = {
  work: 'text-on-primary-container',
  day: 'text-on-surface-variant',
  night: 'text-on-surface-variant',
};

function rowNameOf(city: WorldCity, home: HomeDay): string {
  const past = minutePastOf(city.zone, home);
  return past === null ? city.name : `${city.name} ${past}`;
}

export interface HourPick {
  readonly hour: number;
  readonly summary: string;
  readonly onHour: (hour: number) => void;
}

function useHourDrag(onHour: (hour: number) => void): {
  readonly gesture: ReturnType<typeof Gesture.Pan>;
  readonly onWidth: (width: number) => void;
} {
  const width = useSharedValue(0);
  const last = useSharedValue(-1);
  const choose = (hour: number): void => {
    selectionTick();
    onHour(hour);
  };
  const track = (x: number): void => {
    'worklet';
    const length = width.get();
    if (length <= 0) return;
    const hour = Math.min(DAY_HOURS - 1, Math.max(0, Math.floor((x / length) * DAY_HOURS)));
    if (hour === last.get()) return;
    last.set(hour);
    scheduleOnRN(choose, hour);
  };
  const gesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      track(event.x);
    })
    .onUpdate((event) => {
      track(event.x);
    })
    .onFinalize(() => {
      last.set(-1);
    });
  return {
    gesture,
    onWidth: (next): void => {
      width.set(next);
    },
  };
}

function labelShown(cell: HourCell, sparse: boolean): boolean {
  return !sparse || cell.hour % SPARSE_LABEL_STEP === 0;
}

function CellRow({
  cells,
  slim,
  sparse,
}: {
  readonly cells: readonly HourCell[];
  readonly slim: boolean;
  readonly sparse: boolean;
}): ReactNode {
  return (
    <View className={cn('justify-center', slim ? 'h-6' : 'h-7')}>
      <View
        className={cn(
          'flex-row',
          slim
            ? 'h-2.5 overflow-hidden rounded-full border-hairline border-outline-variant'
            : 'h-7 gap-0.5',
        )}
      >
        {cells.map((cell) => (
          <View
            key={cell.hour}
            className={cn(
              'flex-1 items-center justify-center',
              slim ? SLIM_TONE[cell.tone] : cn('rounded-sm', CELL_TONE[cell.tone]),
            )}
          >
            {slim || !labelShown(cell, sparse) ? null : (
              <Text
                variant="caption"
                className={cn('tabular', LABEL_TONE[cell.tone])}
                numberOfLines={1}
              >
                {cell.label}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function markerPlace(hour: number): ViewStyle {
  return { left: percentOf(hour / DAY_HOURS), width: percentOf(1 / DAY_HOURS) };
}

function Marker({ hour }: { readonly hour: number }): ReactNode {
  return (
    <View
      pointerEvents="none"
      style={markerPlace(hour)}
      className="absolute -inset-y-1.5 rounded-md border-2 border-primary"
    />
  );
}

function PickedTimes({
  cities,
  at,
  slim,
}: {
  readonly cities: readonly WorldCity[];
  readonly at: number;
  readonly slim: boolean;
}): ReactNode {
  const instant = useInstantClock();
  return (
    <View className="min-w-12 gap-1">
      {cities.map((city) => (
        <View key={city.key} className={cn('items-end justify-center', slim ? 'h-6' : 'h-7')}>
          <Text variant="caption" tone="variant" className="tabular">
            {instant(at, city.zone)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function onActionOf(pick: HourPick): (event: AccessibilityActionEvent) => void {
  return (event) => {
    const by = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    pick.onHour(hourShiftedBy(pick.hour, by));
  };
}

export interface HourGridProps {
  readonly cities: readonly WorldCity[];
  readonly home: HomeDay;
  readonly plan: HourPlan;
  readonly pick: HourPick;
  readonly slim: boolean;
}

function Cells({
  cities,
  home,
  plan,
  pick,
  slim,
  onWidth,
}: HourGridProps & { readonly onWidth: (width: number) => void }): ReactNode {
  const [width, setWidth] = useState(0);
  const hour24 = useHour24();
  const sparse = width / DAY_HOURS < LABEL_EVERY_CELL;
  return (
    <View
      accessible
      accessibilityRole={slim ? 'image' : 'adjustable'}
      accessibilityLabel="Hour to compare"
      accessibilityValue={{ text: pick.summary }}
      {...(slim
        ? {}
        : {
            accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
            onAccessibilityAction: onActionOf(pick),
          })}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        onWidth(event.nativeEvent.layout.width);
      }}
      className="flex-1 gap-1"
    >
      {cities.map((city) => (
        <CellRow
          key={city.key}
          cells={hourCellsOf(city.zone, home, plan, hour24)}
          slim={slim}
          sparse={sparse}
        />
      ))}
      <Marker hour={pick.hour} />
    </View>
  );
}

export function HourGrid(props: HourGridProps): ReactNode {
  const { cities, home, pick, slim } = props;
  const drag = useHourDrag(pick.onHour);
  const cells = <Cells {...props} onWidth={drag.onWidth} />;
  return (
    <View className={cn('flex-row', slim ? 'gap-2' : 'gap-3')}>
      <View className={cn('gap-1', slim ? 'w-24' : 'w-30')}>
        {cities.map((city) => (
          <View key={city.key} className={cn('justify-center', slim ? 'h-6' : 'h-7')}>
            <Text variant={slim ? 'caption' : 'footnote'} numberOfLines={1}>
              {rowNameOf(city, home)}
            </Text>
          </View>
        ))}
      </View>
      {slim ? cells : <GestureDetector gesture={drag.gesture}>{cells}</GestureDetector>}
      <PickedTimes cities={cities} at={instantAt(home, pick.hour)} slim={slim} />
    </View>
  );
}
