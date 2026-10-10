import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { DateNav } from '../../../components/date-nav';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { RANGES, type CostRange } from './costs-params';
import { RANGE_LABELS, type CostWindow } from './costs-range';

function dateOf(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

function dayOf(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface RangeChoice {
  readonly range: CostRange;
  readonly from?: string;
  readonly to?: string;
}

function CustomRange({
  window,
  today,
  onPick,
}: {
  readonly window: CostWindow;
  readonly today: string;
  readonly onPick: (choice: RangeChoice) => void;
}): ReactNode {
  const [from, setFrom] = useState(window.firstDay);
  const [to, setTo] = useState(window.lastDay);
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-3">
        <Text variant="footnote" tone="variant">
          From
        </Text>
        <DateNav
          value={dateOf(from)}
          range="day"
          max={dateOf(to)}
          onChange={(date) => {
            setFrom(dayOf(date));
          }}
        />
        <Text variant="footnote" tone="variant">
          to
        </Text>
        <DateNav
          value={dateOf(to)}
          range="day"
          max={dateOf(today)}
          onChange={(date) => {
            setTo(dayOf(date));
          }}
        />
      </View>
      <Button
        label="Show these days"
        disabled={from > to}
        onPress={() => {
          onPick({ range: 'custom', from, to });
        }}
      />
    </View>
  );
}

export interface RangeSheetProps {
  readonly open: boolean;
  readonly range: CostRange;
  readonly window: CostWindow;
  readonly today: string;
  readonly onClose: () => void;
  readonly onPick: (choice: RangeChoice) => void;
}

export function RangeSheet({
  open,
  range,
  window,
  today,
  onClose,
  onPick,
}: RangeSheetProps): ReactNode {
  const pick = (choice: RangeChoice): void => {
    onPick(choice);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Dates" detents={['fit']}>
      <View className="gap-4 pb-2">
        <List inset>
          {RANGES.filter((each) => each !== 'custom').map((each) => (
            <ListRow
              key={each}
              title={RANGE_LABELS[each]}
              selected={range === each}
              {...(range === each
                ? { trailing: <Icon name="check" size={20} tone="primary" /> }
                : {})}
              onPress={() => {
                pick({ range: each });
              }}
            />
          ))}
        </List>
        <CustomRange window={window} today={today} onPick={pick} />
      </View>
    </Sheet>
  );
}
