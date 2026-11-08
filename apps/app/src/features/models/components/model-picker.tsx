import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ModelSpec } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { FINISH_TOKEN_HASH } from '../../../components/models/three/finish-token-hash';
import { cn } from '../../../design/cn';
import { categoryLabel } from '../../../format/text';
import type { ModelAssetState } from '../data/asset-loader';
import { useModelCatalog } from '../data/catalog';
import { useModelSpecs } from '../data/use-model-asset';
import type { PickerRow } from '../settings';
import { ModelVisual, type ModelSource as VisualSource } from '../visual/model-visual';

export const THUMB_SIZES = {
  row: { px: 64, frame: 'size-16 rounded-md' },
  preview: { px: 160, frame: 'size-40 rounded-lg' },
} as const;

export type ThumbSize = keyof typeof THUMB_SIZES;

export const PROVIDED_LABEL = 'Provided';

export const PICKER_LABEL = 'Models';

export function visualSourceOf(
  specHash: string | null,
  spec: ModelAssetState<ModelSpec>,
  finish: string | null,
): VisualSource | null {
  if (specHash === null || spec.status !== 'ready') return null;
  const finishes = spec.value.finishes ?? {};
  const shown = finish !== null && finish in finishes ? finish : (spec.value.defaultFinish ?? null);
  return { spec: spec.value, specHash, tokenHash: FINISH_TOKEN_HASH, finish: shown, params: {} };
}

function IconThumb({ icon }: { readonly icon: IconName }): ReactNode {
  return (
    <View className="h-full w-full items-center justify-center bg-surface-3">
      <Icon name={icon} size={24} tone="variant" />
    </View>
  );
}

export function ModelThumb({
  source,
  icon,
  size,
}: {
  readonly source: VisualSource | null;
  readonly icon: IconName;
  readonly size: ThumbSize;
}): ReactNode {
  const { px, frame } = THUMB_SIZES[size];
  return (
    <View className={cn('shrink-0 overflow-hidden bg-surface-3', frame)}>
      {source === null ? (
        <IconThumb icon={icon} />
      ) : (
        <ModelVisual source={source} view={size === 'row' ? 'tile' : 'card'} px={px} signals={{}} />
      )}
    </View>
  );
}

function stateText(row: PickerRow, spec: ModelAssetState<ModelSpec>): string {
  if (spec.status === 'failed') return 'The model file is missing';
  return categoryLabel(row.category);
}

function RowText({
  row,
  spec,
}: {
  readonly row: PickerRow;
  readonly spec: ModelAssetState<ModelSpec>;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text
        variant="body-strong"
        tone={row.chosen ? 'onPrimaryContainer' : 'default'}
        numberOfLines={1}
      >
        {row.title}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text
          variant="caption"
          tone={row.chosen ? 'onPrimaryContainer' : 'variant'}
          numberOfLines={1}
        >
          {stateText(row, spec)}
        </Text>
        {row.provided ? <Badge label={PROVIDED_LABEL} tone="primary" icon="check" /> : null}
      </View>
    </View>
  );
}

function Row({
  row,
  source,
  spec,
  icon,
  disabled,
  onChoose,
}: {
  readonly row: PickerRow;
  readonly source: VisualSource | null;
  readonly spec: ModelAssetState<ModelSpec>;
  readonly icon: IconName;
  readonly disabled: boolean;
  readonly onChoose: (id: string) => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      label={row.provided ? `${row.title}, ${PROVIDED_LABEL.toLowerCase()}` : row.title}
      selected={row.chosen}
      disabled={disabled}
      onPress={(): void => {
        if (!row.chosen) onChoose(row.id);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center gap-3 rounded-lg border-hairline p-2',
        row.chosen ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
        disabled && 'opacity-60',
      )}
    >
      <ModelThumb source={source} icon={icon} size="row" />
      <RowText row={row} spec={spec} />
      <Icon
        name={row.chosen ? 'check' : 'circle'}
        size={20}
        tone={row.chosen ? 'onPrimaryContainer' : 'faint'}
      />
    </Interactive>
  );
}

export interface ModelPickerProps {
  readonly rows: readonly PickerRow[];
  readonly finish: string | null;
  readonly icon: IconName;
  readonly disabled: boolean;
  readonly onChoose: (id: string) => void;
}

export function ModelPicker({
  rows,
  finish,
  icon,
  disabled,
  onChoose,
}: ModelPickerProps): ReactNode {
  const catalog = useModelCatalog();
  const hashes = rows.map((row) => catalog.find(row.id)?.spec_sha256 ?? null);
  const specs = useModelSpecs(hashes);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={PICKER_LABEL} className="gap-2">
      {rows.map((row, at) => {
        const spec = specs[at] ?? { status: 'idle' };
        return (
          <Row
            key={row.id}
            row={row}
            spec={spec}
            source={visualSourceOf(hashes[at] ?? null, spec, row.chosen ? finish : null)}
            icon={icon}
            disabled={disabled}
            onChoose={onChoose}
          />
        );
      })}
    </View>
  );
}
