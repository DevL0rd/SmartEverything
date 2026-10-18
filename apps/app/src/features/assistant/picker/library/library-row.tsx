import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Icon } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { useKeyboardRow } from '../../../../components/keyboard-list';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { useIdiom } from '../../../../design/platform';
import { useMoney } from '../../../region';
import { contextText } from '../../data/cost';
import type { ModelChoice } from '../model-choice';
import { CapabilityIcon, priceOf, type Capability } from '../model-row';
import { ProviderLogo } from '../provider-logo';
import { marksOf, type LibraryMode } from './library-model';
import type { LibraryRow } from './library-rows';

const INPUT_CAPABILITIES: Readonly<Record<string, Capability>> = {
  image: { icon: 'image', label: 'Image input' },
  audio: { icon: 'mic', label: 'Audio input' },
  video: { icon: 'film', label: 'Video input' },
  file: { icon: 'fileText', label: 'File input' },
};

const OUTPUT_CAPABILITIES: Readonly<Record<string, Capability>> = {
  image: { icon: 'image', label: 'Image output' },
  audio: { icon: 'mic', label: 'Audio output' },
};

function known(
  table: Readonly<Record<string, Capability>>,
  values: readonly string[],
): readonly Capability[] {
  return values.flatMap((value) => {
    const capability = table[value];
    return capability === undefined ? [] : [capability];
  });
}

export function capabilitiesOf(model: ModelChoice): readonly Capability[] {
  return [
    ...(model.efforts.length === 0 ? [] : [{ icon: 'brain' as const, label: 'Thinking' }]),
    ...known(INPUT_CAPABILITIES, model.inputs),
    ...known(OUTPUT_CAPABILITIES, model.outputs),
  ];
}

function Facts({ row }: { readonly row: LibraryRow }): ReactNode {
  const money = useMoney();
  const { model } = row.candidate;
  const text = [contextText(model.contextLength), priceOf(model, money)]
    .filter((part) => part !== null)
    .join(' · ');
  return (
    <View className="flex-row items-center gap-2">
      <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
        {text}
      </Text>
      {capabilitiesOf(model).map((capability) => (
        <CapabilityIcon key={capability.label} capability={capability} />
      ))}
    </View>
  );
}

function Reason({ text }: { readonly text: string }): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      <Icon name="warning" size={16} tone="warning" />
      <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
        {text}
      </Text>
    </View>
  );
}

function Marks({ row, mode }: { readonly row: LibraryRow; readonly mode: LibraryMode }): ReactNode {
  const { selected, model } = row.candidate;
  const marks = marksOf(mode, selected, model.latest);
  return (
    <>
      {marks.badge ? <Badge label="Default" tone="primary" /> : null}
      {marks.latestCaption ? (
        <Text variant="caption" tone="primary">
          Default
        </Text>
      ) : null}
      {marks.check ? <Icon name="check" size={16} tone="primary" /> : null}
    </>
  );
}

function Body({ row, mode }: { readonly row: LibraryRow; readonly mode: LibraryMode }): ReactNode {
  const { model } = row.candidate;
  const subtitle = [model.providerLabel, row.where].filter((part) => part !== null).join(' · ');
  return (
    <>
      <ProviderLogo provider={model.provider} name={model.providerLabel} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text variant="body-strong" numberOfLines={1} className="min-w-0 shrink">
            {model.name}
          </Text>
          <Marks row={row} mode={mode} />
        </View>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {subtitle}
        </Text>
        {row.reason === null ? <Facts row={row} /> : <Reason text={row.reason} />}
      </View>
    </>
  );
}

export interface LibraryRowViewProps {
  readonly row: LibraryRow;
  readonly mode: LibraryMode;
  readonly shown: boolean;
  readonly onSelect: (key: string) => void;
  readonly onFavourite: ((id: string) => void) | null;
}

function labelOf(row: LibraryRow): string {
  const { model, selected } = row.candidate;
  return [model.name, model.providerLabel, selected ? 'current' : null, row.reason]
    .filter((part) => part !== null)
    .join(', ');
}

function LibraryRowView({
  row,
  mode,
  shown,
  onSelect,
  onFavourite,
}: LibraryRowViewProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const keyboard = useKeyboardRow(row.key);
  const { favourite } = row.candidate;
  return (
    <View
      nativeID={keyboard.nativeID}
      className={cn(
        'flex-row items-center rounded-md',
        touch ? 'h-22' : 'h-18',
        shown ? 'bg-primary-container' : keyboard.highlighted && 'bg-surface-2',
      )}
    >
      <Interactive
        label={labelOf(row)}
        selected={shown}
        onPress={(): void => {
          keyboard.highlight();
          onSelect(row.key);
        }}
        className="h-full min-w-0 flex-1 flex-row items-center gap-3 rounded-md px-3"
        layerClassName="rounded-md"
      >
        <Body row={row} mode={mode} />
      </Interactive>
      {onFavourite === null ? null : (
        <IconButton
          icon="star"
          label={`${favourite ? 'Unfavourite' : 'Favourite'} ${row.candidate.model.name}`}
          selected={favourite}
          tone={favourite ? 'primary' : 'faint'}
          onPress={(): void => {
            onFavourite(row.favouriteId);
          }}
        />
      )}
    </View>
  );
}

function same(left: LibraryRowViewProps, right: LibraryRowViewProps): boolean {
  return (
    left.row.candidate === right.row.candidate &&
    left.row.reason === right.row.reason &&
    left.row.where === right.row.where &&
    left.mode === right.mode &&
    left.shown === right.shown &&
    left.onSelect === right.onSelect &&
    left.onFavourite === right.onFavourite
  );
}

export const LibraryRowItem = memo(LibraryRowView, same);
