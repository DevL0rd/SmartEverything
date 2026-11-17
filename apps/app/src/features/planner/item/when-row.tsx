import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { DateNav } from '../../../components/date-nav';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { TimeField, type TimeOfDay } from '../../../components/time-field';
import { localDayKey, startOfDayKey } from '../../../format/time';
import type { ItemFieldsProps } from './item-fields';
import {
  dueDayOf,
  timeOfLocal,
  whenTextOf,
  withDueDay,
  withEndTime,
  withStartDay,
  withStartTime,
} from './item-history';
import { useHour24 } from '../../../store/clock-format';

export type WhenRowProps = Pick<
  ItemFieldsProps,
  'item' | 'today' | 'whenCaption' | 'openWhen' | 'disabled' | 'onChange'
>;

function dateOfDay(day: string): Date {
  return new Date(startOfDayKey(day));
}

function TimeColumn({
  caption,
  value,
  onChange,
}: {
  readonly caption: string;
  readonly value: TimeOfDay;
  readonly onChange: (value: TimeOfDay) => void;
}): ReactNode {
  const hour24 = useHour24();
  return (
    <View className="items-center gap-1">
      <Text variant="caption" tone="variant">
        {caption}
      </Text>
      <TimeField hour24={hour24} label={caption} value={value} onChange={onChange} />
    </View>
  );
}

function TimeRange({ item, onChange }: WhenRowProps): ReactNode {
  const start = item.start_local;
  if (start?.includes('T') !== true) return null;
  const end = item.end_local;
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
      <TimeColumn
        caption="Starts"
        value={timeOfLocal(start)}
        onChange={(time) => {
          onChange(withStartTime(item, time));
        }}
      />
      {end === null ? null : (
        <>
          <Text variant="callout" tone="variant" className="mt-5">
            to
          </Text>
          <TimeColumn
            caption="Ends"
            value={timeOfLocal(end)}
            onChange={(time) => {
              onChange(withEndTime(item, time));
            }}
          />
        </>
      )}
    </View>
  );
}

function StartDate({ item, onChange }: WhenRowProps): ReactNode {
  const start = item.start_local;
  if (start === null) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <Text variant="caption" tone="variant">
        {item.kind === 'event' ? 'Date' : 'Starts on'}
      </Text>
      <DateNav
        value={dateOfDay(start.slice(0, 10))}
        range="day"
        arrows
        onChange={(date) => {
          onChange(withStartDay(item, localDayKey(date)));
        }}
      />
    </View>
  );
}

function DueDate({ item, today, onChange }: WhenRowProps): ReactNode {
  const due = dueDayOf(item, today.timeZone);
  const pick = (day: string | null): void => {
    onChange(withDueDay(item, day, today.timeZone));
  };
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <Text variant="caption" tone="variant">
        {due === null ? 'No date yet, pick one' : 'Due'}
      </Text>
      <DateNav
        value={dateOfDay(due ?? localDayKey(today.now, today.timeZone))}
        range="day"
        arrows
        onChange={(date) => {
          pick(localDayKey(date));
        }}
      />
      {due === null ? null : (
        <Button
          label="No date"
          icon="close"
          variant="text"
          onPress={() => {
            pick(null);
          }}
        />
      )}
    </View>
  );
}

function WhenEditor(props: WhenRowProps): ReactNode {
  return (
    <View className="gap-3 px-4 pb-3">
      {props.item.start_local === null ? <DueDate {...props} /> : <StartDate {...props} />}
      <TimeRange {...props} />
    </View>
  );
}

export function WhenRow(props: WhenRowProps): ReactNode {
  const { item, today, whenCaption, openWhen, disabled } = props;
  const [open, setOpen] = useState(openWhen);
  const text = whenTextOf(item, today);
  const row = {
    title: 'When',
    icon: 'clock',
    subtitle: text,
    wrapSubtitle: true,
    subtitleTone: 'default',
    ...(whenCaption === null ? {} : { caption: whenCaption }),
  } as const;
  if (disabled) return <ListRow {...row} />;
  return (
    <View>
      <ListRow
        {...row}
        expanded={open}
        label={`When, ${text}`}
        trailing={<Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} tone="faint" />}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open ? <WhenEditor {...props} /> : null}
    </View>
  );
}
