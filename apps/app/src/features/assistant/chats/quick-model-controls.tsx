import type { ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import type { Engine } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Segmented } from '../../../components/segmented';
import type { ModelCandidate } from '../picker/model-candidates';
import { isComputerEngine } from '../provider/computer-engine';
import { useEngineEfforts } from './engine-efforts';
import { effortLabel } from '../picker/efforts';
function QuickFavorite({
  item,
  close,
}: {
  readonly item: ModelCandidate;
  readonly close: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`${item.model.name}, ${item.model.providerLabel}`}
      disabled={item.pick === null}
      onPress={(): void => {
        item.pick?.();
        close();
      }}
      className="min-h-touch-min flex-row items-center gap-2 px-3"
      layerClassName="rounded-md"
    >
      <Icon name={item.selected ? 'check' : 'star'} size={16} tone="variant" />
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {item.model.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {item.model.providerLabel}
        </Text>
      </View>
    </Interactive>
  );
}
export function QuickFavorites({
  rows,
  close,
}: {
  readonly rows: readonly ModelCandidate[];
  readonly close: () => void;
}): ReactNode {
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      className="max-h-56 shrink"
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <QuickFavorite item={item} close={close} />}
      ListEmptyComponent={
        <Text variant="caption" tone="variant" className="px-3 py-2">
          Star models to keep them here.
        </Text>
      }
    />
  );
}
export function QuickThinking({
  engine,
  onChange,
  blocked,
}: {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked: boolean;
}): ReactNode {
  const efforts = useEngineEfforts(engine);
  if (efforts.length === 0) return null;
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant">
        Thinking
      </Text>
      <Segmented
        label="Thinking"
        value={engine.effort ?? ''}
        disabled={blocked}
        options={[
          { value: '', label: isComputerEngine(engine) ? 'Runtime default' : 'Default' },
          ...efforts.map((value) => ({ value, label: effortLabel(value) })),
        ]}
        onChange={(value): void => {
          if (!blocked) onChange({ ...engine, effort: value === '' ? null : value });
        }}
      />
    </View>
  );
}
