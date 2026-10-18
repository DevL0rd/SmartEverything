import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { cautionIcon, type AccessRow } from './access-model';

function RadioMark({ selected }: { readonly selected: boolean }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-5 items-center justify-center rounded-full border-2',
        selected ? 'border-primary' : 'border-on-surface-variant',
      )}
    >
      {selected ? <View className="size-2.5 rounded-full bg-primary" /> : null}
    </View>
  );
}

function rowLabel(row: AccessRow): string {
  return row.unavailable === null ? row.option.title : `${row.option.title}, ${row.unavailable}`;
}

function RowText({ row }: { readonly row: AccessRow }): ReactNode {
  const caution = cautionIcon(row);
  const detail = row.unavailable ?? row.option.description;
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-1.5">
        <Text variant="body" numberOfLines={2} className="shrink">
          {row.option.title}
        </Text>
        {caution === null ? null : <Icon name={caution} size={16} tone="warning" />}
      </View>
      {detail === null ? null : (
        <Text variant="callout" tone="variant" numberOfLines={2}>
          {detail}
        </Text>
      )}
    </View>
  );
}

export function AccessRowView({
  row,
  disabled,
  busy,
  onSelect,
}: {
  readonly row: AccessRow;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly onSelect: () => void;
}): ReactNode {
  const inert = (disabled || row.unavailable !== null) && !row.selected;
  return (
    <Interactive
      role="radio"
      checked={row.selected}
      disabled={inert}
      label={rowLabel(row)}
      onPress={onSelect}
      className={cn(
        'min-h-row-h flex-row items-center gap-3 px-4 py-2',
        row.selected && 'bg-primary-container',
        inert && 'opacity-60',
      )}
    >
      <RadioMark selected={row.selected} />
      <RowText row={row} />
      {busy ? <ActivityIndicator size="small" colorClassName="accent-on-surface" /> : null}
    </Interactive>
  );
}
