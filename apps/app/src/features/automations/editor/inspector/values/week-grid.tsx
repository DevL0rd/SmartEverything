import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../../components/button';
import { IconButton } from '../../../../../components/icon-button';
import { Interactive } from '../../../../../components/interactive';
import { Text } from '../../../../../components/text';
import { TimeField } from '../../../../../components/time-field';
import { cn } from '../../../../../design/cn';
import type { FieldControl } from '../schema-fields';
import { timeOfDayParts, timeOfDayText } from './literal-model';
import type { LiteralProps } from './literal-scalar';
import {
  WEEK_DAYS,
  daysText,
  newBlock,
  storedBlocks,
  toggledDay,
  weekBlocks,
  type WeekBlock,
} from './moment-model';

function DayChip({
  name,
  short,
  on,
  disabled,
  onPress,
}: {
  readonly name: string;
  readonly short: string;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      role="checkbox"
      label={name}
      checked={on}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-touch-min min-w-touch-min items-center justify-center rounded-full border-hairline px-2',
        on ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
      layerClassName="rounded-full"
    >
      <Text variant="label">{short}</Text>
    </Interactive>
  );
}

function BlockRow({
  label,
  block,
  disabled,
  onChange,
  onRemove,
}: {
  readonly label: string;
  readonly block: WeekBlock;
  readonly disabled: boolean;
  readonly onChange: (block: WeekBlock) => void;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <View className="gap-2 rounded-md border-hairline border-outline-variant p-3">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <TimeField
            label={`${label} start time`}
            value={timeOfDayParts(block.at)}
            onChange={(next) => {
              if (!disabled) onChange({ ...block, at: timeOfDayText(next.hour, next.minute) });
            }}
          />
        </View>
        <IconButton icon="close" label={`Remove ${label}`} disabled={disabled} onPress={onRemove} />
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        {WEEK_DAYS.map((entry) => (
          <DayChip
            key={entry.day}
            name={entry.name}
            short={entry.short}
            on={block.days.includes(entry.day)}
            disabled={disabled}
            onPress={() => {
              onChange({ ...block, days: toggledDay(block.days, entry.day) });
            }}
          />
        ))}
      </View>
      <Text variant="footnote" tone="variant">
        {daysText(block.days)}
      </Text>
    </View>
  );
}

export function WeekGridLiteral({
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<FieldControl>): ReactNode {
  const blocks = weekBlocks(value);
  const save = (next: readonly WeekBlock[]): void => {
    onChange(storedBlocks(next));
  };
  return (
    <View className="gap-2">
      {blocks.length === 0 ? (
        <Text variant="footnote" tone="variant">
          No start times yet
        </Text>
      ) : null}
      {blocks.map((block, index) => (
        <BlockRow
          key={index}
          label={`${label} time ${String(index + 1)}`}
          block={block}
          disabled={disabled}
          onChange={(next) => {
            save(blocks.map((held, at) => (at === index ? next : held)));
          }}
          onRemove={() => {
            save(blocks.filter((_, at) => at !== index));
          }}
        />
      ))}
      <View className="self-start">
        <Button
          label="Add a start time"
          icon="plus"
          variant="tonal"
          disabled={disabled}
          onPress={() => {
            save([...blocks, newBlock()]);
          }}
        />
      </View>
    </View>
  );
}
