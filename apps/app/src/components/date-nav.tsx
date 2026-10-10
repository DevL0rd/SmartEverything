import type { ReactNode } from 'react';
import { useState } from 'react';
import { Modal, View } from 'react-native';
import { cn } from '../design/cn';
import { useMotion } from '../design/motion';
import { useIdiom } from '../design/platform';
import { dayLabel, localDayKey } from '../format/time';
import { startOf } from './charts/scale';
import { Icon } from './icon';
import { IconButton } from './icon-button';
import { Interactive } from './interactive';
import { Text } from './text';

type DateRange = 'day' | 'week' | 'month' | 'year';

export interface DateNavProps {
  readonly value: Date;
  readonly range: DateRange;
  readonly onChange: (date: Date) => void;
  readonly max?: Date;
}

const CURRENT: Readonly<Record<Exclude<DateRange, 'day'>, string>> = {
  week: 'This week',
  month: 'This month',
  year: 'This year',
};

function shifted(date: Date, range: DateRange, by: number): Date {
  const next = new Date(date);
  if (range === 'day' || range === 'week') {
    next.setDate(next.getDate() + by * (range === 'week' ? 7 : 1));
    return next;
  }
  const months = range === 'month' ? by : by * 12;
  const target = new Date(next.getFullYear(), next.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(next.getDate(), last));
  target.setHours(next.getHours(), next.getMinutes());
  return target;
}

function samePeriod(a: Date, b: Date, range: DateRange): boolean {
  return startOf(a.getTime(), range).getTime() === startOf(b.getTime(), range).getTime();
}

function chipLabel(value: Date, range: DateRange, today: Date): string {
  if (range === 'day') {
    return dayLabel(value, today.getTime());
  }
  if (samePeriod(value, today, range)) {
    return CURRENT[range];
  }
  if (range === 'week') {
    const start = startOf(value.getTime(), 'week');
    return `Week of ${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }
  return range === 'month'
    ? value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : String(value.getFullYear());
}

function allowed(date: Date, range: DateRange, max: Date | undefined): boolean {
  return max === undefined || startOf(date.getTime(), range).getTime() <= max.getTime();
}

function capped(date: Date, max: Date | undefined): Date {
  return max !== undefined && date.getTime() > max.getTime() ? new Date(max) : date;
}

function monthCells(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function weekdayLabels(): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, 1 + index).toLocaleDateString(undefined, { weekday: 'narrow' }),
  );
}

interface DayCellProps {
  readonly day: Date;
  readonly selected: boolean;
  readonly today: boolean;
  readonly disabled: boolean;
  readonly onPick: (day: Date) => void;
}

function DayCell({ day, selected, today, disabled, onPick }: DayCellProps): ReactNode {
  return (
    <Interactive
      label={day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      selected={selected}
      disabled={disabled}
      onPress={() => {
        onPick(day);
      }}
      className={cn(
        'size-10 items-center justify-center rounded-full',
        selected && 'bg-primary',
        today && !selected && 'border border-primary',
      )}
      layerClassName="rounded-full"
    >
      <Text variant="callout" tone={selected ? 'onPrimary' : 'default'} className="tabular">
        {String(day.getDate())}
      </Text>
    </Interactive>
  );
}

interface CalendarProps {
  readonly value: Date;
  readonly today: Date;
  readonly max: Date | undefined;
  readonly onPick: (day: Date) => void;
}

function MonthHeader({
  month,
  max,
  onMonth,
}: {
  readonly month: Date;
  readonly max: Date | undefined;
  readonly onMonth: (month: Date) => void;
}): ReactNode {
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return (
    <View className="flex-row items-center justify-between">
      <IconButton
        icon="chevronLeft"
        label="Previous month"
        onPress={() => {
          onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
        }}
      />
      <Text variant="title-3">
        {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </Text>
      <IconButton
        icon="chevronRight"
        label="Next month"
        disabled={!allowed(next, 'month', max)}
        onPress={() => {
          onMonth(next);
        }}
      />
    </View>
  );
}

function Calendar({ value, today, max, onPick }: CalendarProps): ReactNode {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const cells = monthCells(month);
  const rows = Array.from({ length: cells.length / 7 }, (_, row) =>
    cells.slice(row * 7, row * 7 + 7),
  );
  const key = localDayKey(value);
  const todayKey = localDayKey(today);
  return (
    <View className="gap-1">
      <MonthHeader month={month} max={max} onMonth={setMonth} />
      <View className="flex-row">
        {weekdayLabels().map((name, index) => (
          <Text
            key={`${name}-${String(index)}`}
            variant="caption"
            tone="faint"
            align="center"
            className="flex-1"
          >
            {name}
          </Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={`row-${String(rowIndex)}`} className="flex-row">
          {row.map((day, index) => (
            <View
              key={day === null ? `blank-${String(index)}` : localDayKey(day)}
              className="flex-1 items-center"
            >
              {day === null ? null : (
                <DayCell
                  day={day}
                  selected={localDayKey(day) === key}
                  today={localDayKey(day) === todayKey}
                  disabled={max !== undefined && day.getTime() > max.getTime()}
                  onPick={onPick}
                />
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function CalendarModal({
  open,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  const { reduced } = useMotion();
  return (
    <Modal
      transparent
      visible={open}
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View className={cn('flex-1', touch ? 'justify-end' : 'items-center justify-center')}>
        <Interactive
          label="Close calendar"
          onPress={onClose}
          className="absolute inset-0 bg-scrim"
          layerClassName="hidden"
        >
          <View />
        </Interactive>
        <View
          accessibilityViewIsModal
          className={cn(
            'bg-surface-raised p-4 elevation-3',
            touch ? 'w-full rounded-t-xxl pb-8' : 'w-80 rounded-xl border border-outline-variant',
          )}
        >
          {open ? children : null}
        </View>
      </View>
    </Modal>
  );
}

function DateChip({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`${label}, choose date`}
      onPress={onPress}
      className="h-control-h flex-row items-center gap-1 rounded-full bg-surface-2 px-4"
      layerClassName="rounded-full"
    >
      <Text variant="label">{label}</Text>
      <Icon name="chevronDown" size={16} />
    </Interactive>
  );
}

export function DateNav({ value, range, onChange, max }: DateNavProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(() => new Date());
  const previous = shifted(value, range, -1);
  const next = shifted(value, range, 1);
  const label = chipLabel(value, range, today);
  const go = (date: Date) => (): void => {
    onChange(date);
  };
  return (
    <View className="flex-row items-center gap-1">
      {pointer ? (
        <IconButton icon="chevronLeft" label={`Previous ${range}`} onPress={go(previous)} />
      ) : null}
      <DateChip
        label={label}
        onPress={() => {
          setToday(new Date());
          setOpen(true);
        }}
      />
      {pointer ? (
        <IconButton
          icon="chevronRight"
          label={`Next ${range}`}
          disabled={!allowed(next, range, max)}
          onPress={go(capped(next, max))}
        />
      ) : null}
      <CalendarModal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Calendar
          value={value}
          today={today}
          max={max}
          onPick={(day) => {
            setOpen(false);
            onChange(day);
          }}
        />
      </CalendarModal>
    </View>
  );
}
