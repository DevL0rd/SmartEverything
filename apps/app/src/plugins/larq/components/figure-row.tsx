import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { decimal } from '../../../format/number';
import { minutesOfDay, relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { paceOf } from '../model/bottle-model';

interface Cell {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly caption: string;
  readonly tone?: Tone;
}

function levelCell(view: BottleStatusView): Cell {
  const { ml, pct } = view.level;
  return ml === null
    ? { key: 'level', label: 'In the bottle', value: '–', caption: 'Level unknown' }
    : {
        key: 'level',
        label: 'In the bottle',
        value: decimal(Math.round(ml)),
        unit: 'ml',
        caption: pct === null ? `of ${decimal(view.body)} ml` : `${String(Math.round(pct))}% full`,
      };
}

function drinkCell(view: BottleStatusView, now: number): Cell {
  const { lastDrinkAt } = view.today;
  if (lastDrinkAt === null) {
    return { key: 'drink', label: 'Last drink', value: 'None', caption: 'No drinks yet today' };
  }
  const text = relative(lastDrinkAt, now);
  const ago = text.endsWith(' ago');
  return {
    key: 'drink',
    label: 'Last drink',
    value: ago ? text.slice(0, -4) : text,
    ...(ago ? { unit: 'ago' } : {}),
    caption: `${String(view.today.drinks.length)} from the bottle today`,
  };
}

function batteryCell(view: BottleStatusView): Cell {
  const { batteryPct, daysLeft } = view.cap;
  return batteryPct === null
    ? { key: 'battery', label: 'Battery', value: '–', caption: 'Battery unknown' }
    : {
        key: 'battery',
        label: 'Battery',
        value: String(batteryPct),
        unit: '%',
        caption: daysLeft === null ? 'Days left unknown' : `about ${String(daysLeft)} days left`,
        ...(view.cap.lowBattery ? { tone: 'warning' as const } : {}),
      };
}

function paceCell(view: BottleStatusView, minute: number): Cell {
  const pace = paceOf(view.today, minute);
  if (pace.expectedMl === 0) {
    return { key: 'pace', label: 'Pace', value: 'On pace', caption: 'The day has not started' };
  }
  const ahead = pace.deltaMl >= 0;
  return {
    key: 'pace',
    label: 'Pace',
    value: `${ahead ? '+' : '−'}${decimal(Math.abs(pace.deltaMl))}`,
    unit: 'ml',
    caption: ahead ? 'ahead of pace' : 'behind pace',
    tone: ahead ? 'positive' : 'warning',
  };
}

function FigureCell({ cell }: { readonly cell: Cell }): ReactNode {
  return (
    <View className="min-w-32 flex-1 basis-0 gap-0.5">
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {cell.label}
      </Text>
      <Figure
        value={cell.value}
        size="m"
        {...(cell.unit === undefined ? {} : { unit: cell.unit })}
        {...(cell.tone === undefined ? {} : { tone: cell.tone })}
      />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {cell.caption}
      </Text>
    </View>
  );
}

export function FigureRow({ view }: { readonly view: BottleStatusView }): ReactNode {
  const now = useMinute();
  const cells = [
    levelCell(view),
    drinkCell(view, now),
    batteryCell(view),
    paceCell(view, minutesOfDay(now)),
  ];
  return (
    <View className="gap-4">
      <View className="flex-row gap-4">
        {cells.slice(0, 2).map((cell) => (
          <FigureCell key={cell.key} cell={cell} />
        ))}
      </View>
      <View className="flex-row gap-4">
        {cells.slice(2).map((cell) => (
          <FigureCell key={cell.key} cell={cell} />
        ))}
      </View>
    </View>
  );
}
