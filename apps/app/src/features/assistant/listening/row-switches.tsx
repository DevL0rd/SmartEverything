import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { ListeningRow } from './listening-model';
import type { RowActions } from './row-actions';
import { SourceSwitch } from './source-switch';

export function RowSwitches({
  row,
  actions,
  switchable,
}: {
  readonly row: ListeningRow;
  readonly actions: RowActions;
  readonly switchable: boolean;
}): ReactNode {
  if (row.state === 'blocked') {
    return (
      <View className="flex-row items-center gap-1.5 px-4 pb-3 pl-12 medium:w-64 medium:justify-end medium:py-0 medium:pr-4">
        <Icon name="lock" size={16} tone="faint" />
        <Text variant="footnote" tone="faint">
          Never listens
        </Text>
      </View>
    );
  }
  const who = row.source.name;
  const disabled = actions.offline;
  return (
    <View className="flex-row gap-6 px-4 pb-1.5 pl-12 medium:w-72 medium:gap-4 medium:p-0 medium:pr-4">
      <SourceSwitch
        label="Wake"
        who={who}
        value={row.source.wake}
        disabled={disabled}
        fixed={!switchable}
        onChange={(value) => {
          actions.onChange(row, 'wake', value);
        }}
        className="flex-1 medium:w-24 medium:flex-none"
      />
      <SourceSwitch
        label="Write down"
        who={who}
        value={row.source.transcribe}
        disabled={disabled}
        fixed={!switchable}
        onChange={(value) => {
          actions.onChange(row, 'transcribe', value);
        }}
        className="flex-1 medium:w-36 medium:flex-none"
      />
    </View>
  );
}
