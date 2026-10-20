import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { NumberStepper } from '../../../../components/number-stepper';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { TimeField } from '../../../../components/time-field';
import { clockOfTime, timeOfClock } from './clock-text';
import { dayAndClock, type EventRow, type EventWhen } from './scenario-model';
import { ValueField } from './value-field';

export interface TimelineRowsProps {
  readonly rows: readonly EventRow[];
  readonly times: readonly number[];
  readonly zone: string;
  readonly disabled: boolean;
  readonly newId: () => string;
  readonly onChange: (rows: readonly EventRow[]) => void;
}

const FIRST_AT = '19:00';
const FIRST_AFTER = 10;

function WhenField({
  when,
  disabled,
  onChange,
}: {
  readonly when: EventWhen;
  readonly disabled: boolean;
  readonly onChange: (when: EventWhen) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      <Segmented
        label="When"
        disabled={disabled}
        value={when.kind}
        options={[
          { value: 'at', label: 'At a time' },
          { value: 'after', label: 'After a while' },
        ]}
        onChange={(kind) => {
          onChange(kind === 'at' ? { kind, clock: FIRST_AT } : { kind, minutes: FIRST_AFTER });
        }}
      />
      {when.kind === 'at' ? (
        <TimeField
          label="At"
          value={timeOfClock(when.clock)}
          onChange={(time) => {
            onChange({ kind: 'at', clock: clockOfTime(time) });
          }}
        />
      ) : (
        <NumberStepper
          label="Minutes after the row above"
          value={when.minutes}
          min={0}
          max={10_080}
          step={1}
          unit="min"
          disabled={disabled}
          onChange={(minutes) => {
            onChange({ kind: 'after', minutes });
          }}
        />
      )}
    </View>
  );
}

function DeviceFields({
  row,
  disabled,
  onRow,
}: {
  readonly row: EventRow;
  readonly disabled: boolean;
  readonly onRow: (row: EventRow) => void;
}): ReactNode {
  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        <TextField
          label="Device"
          value={row.device}
          disabled={disabled}
          onChange={(device) => {
            onRow({ ...row, device });
          }}
        />
        <TextField
          label="Control"
          value={row.control}
          disabled={disabled}
          onChange={(control) => {
            onRow({ ...row, control });
          }}
        />
      </View>
      <ValueField
        label="Becomes"
        value={row.value}
        disabled={disabled}
        onChange={(value) => {
          onRow({ ...row, value });
        }}
      />
    </>
  );
}

function EventCard({
  row,
  time,
  zone,
  disabled,
  onRow,
  onRemove,
}: {
  readonly row: EventRow;
  readonly time: number | undefined;
  readonly zone: string;
  readonly disabled: boolean;
  readonly onRow: (row: EventRow) => void;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-start gap-2 rounded-md bg-surface-2 p-3">
      <View className="min-w-0 flex-1 gap-2">
        <WhenField
          when={row.when}
          disabled={disabled}
          onChange={(when) => {
            onRow({ ...row, when });
          }}
        />
        {time === undefined ? null : (
          <Text variant="footnote" tone="variant">
            {`Happens ${dayAndClock(time, zone)}`}
          </Text>
        )}
        <DeviceFields row={row} disabled={disabled} onRow={onRow} />
      </View>
      <IconButton
        icon="close"
        label="Remove this timeline row"
        disabled={disabled}
        onPress={onRemove}
      />
    </View>
  );
}

function AddRow({
  rows,
  disabled,
  newId,
  onChange,
}: Pick<TimelineRowsProps, 'rows' | 'disabled' | 'newId' | 'onChange'>): ReactNode {
  return (
    <View className="flex-row">
      <Button
        label="Add a timeline row"
        icon="plus"
        variant="outlined"
        disabled={disabled}
        onPress={() => {
          onChange([
            ...rows,
            {
              id: newId(),
              when: { kind: 'after', minutes: FIRST_AFTER },
              device: '',
              control: '',
              value: true,
            },
          ]);
        }}
      />
    </View>
  );
}

export function TimelineRows({
  rows,
  times,
  zone,
  disabled,
  newId,
  onChange,
}: TimelineRowsProps): ReactNode {
  return (
    <View className="gap-3">
      <Text variant="body-strong">Timeline</Text>
      <Text variant="footnote" tone="variant">
        Things that happen in your pretend home, in order.
      </Text>
      {rows.map((row, index) => (
        <EventCard
          key={row.id}
          row={row}
          time={times[index]}
          zone={zone}
          disabled={disabled}
          onRow={(next) => {
            onChange(rows.map((known) => (known.id === row.id ? next : known)));
          }}
          onRemove={() => {
            onChange(rows.filter((known) => known.id !== row.id));
          }}
        />
      ))}
      <AddRow rows={rows} disabled={disabled} newId={newId} onChange={onChange} />
    </View>
  );
}
