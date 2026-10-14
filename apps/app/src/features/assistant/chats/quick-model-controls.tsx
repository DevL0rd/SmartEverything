import type { ReactElement, ReactNode } from 'react';
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
      label={`${item.model.name}, ${favoriteSource(item.model)}`}
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
          {favoriteSource(item.model)}
        </Text>
      </View>
    </Interactive>
  );
}
export function QuickMenuList({
  rows,
  close,
  header,
  footer,
  height,
  showFavorites,
}: {
  readonly rows: readonly ModelCandidate[];
  readonly close: () => void;
  readonly header: ReactElement;
  readonly footer: ReactElement | null;
  readonly height: number;
  readonly showFavorites: boolean;
}): ReactNode {
  const frame = { maxHeight: height };
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      className="min-h-0 grow-0 shrink-0"
      style={frame}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      renderItem={({ item }) => <QuickFavorite item={item} close={close} />}
      ListEmptyComponent={
        showFavorites ? (
          <Text variant="caption" tone="variant" className="px-3 py-2">
            Star models to keep them here.
          </Text>
        ) : null
      }
    />
  );
}
function favoriteSource(model: ModelCandidate['model']): string {
  return [model.providerLabel, model.supplierLabel, model.billing]
    .filter((label) => label !== undefined)
    .join(' · ');
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
