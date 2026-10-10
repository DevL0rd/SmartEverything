import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Tooltip } from '../../../components/tooltip';
import { cn } from '../../../design/cn';
import { joinParts } from '../../../format/text';
import { useMoney } from '../../region';
import { contextText, pricePerMillionText } from '../data/cost';
import type { Modality, ModelChoice } from './model-choice';
import { ProviderLogo } from './provider-logo';

function Price({ model }: { readonly model: ModelChoice }): ReactNode {
  const { inputPerMillion, outputPerMillion, variable } = model.price;
  const money = useMoney();
  if (!variable && inputPerMillion === null && outputPerMillion === null) {
    return null;
  }
  if (model.price.variable) {
    return (
      <Text variant="caption" tone="variant">
        Price varies
      </Text>
    );
  }
  return (
    <View className="items-end">
      <Text variant="caption" tone="variant">
        {`${pricePerMillionText(model.price.inputPerMillion, money)} in`}
      </Text>
      <Text variant="caption" tone="variant">
        {`${pricePerMillionText(model.price.outputPerMillion, money)} out`}
      </Text>
    </View>
  );
}

function detailsOf(model: ModelChoice): string {
  return joinParts([
    model.latest ? 'Latest' : model.providerLabel,
    contextText(model.contextLength),
    model.efforts.length === 0 ? null : 'Thinking',
  ]);
}

const MODALITY_ICONS: Readonly<Record<Exclude<Modality, 'text'>, IconName>> = {
  image: 'image',
  audio: 'mic',
  video: 'film',
  file: 'fileText',
};

const MODALITY_NAMES: Readonly<Record<Exclude<Modality, 'text'>, string>> = {
  image: 'Images',
  audio: 'Audio',
  video: 'Video',
  file: 'Files',
};

function ModalityIcon({ modality }: { readonly modality: Exclude<Modality, 'text'> }): ReactNode {
  const [hovered, setHovered] = useState(false);
  return (
    <View
      accessible
      accessibilityLabel={MODALITY_NAMES[modality]}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <Icon name={MODALITY_ICONS[modality]} size={16} tone="variant" />
      {hovered ? <Tooltip text={MODALITY_NAMES[modality]} /> : null}
    </View>
  );
}

function Modalities({ model }: { readonly model: ModelChoice }): ReactNode {
  const extra = [...new Set([...model.inputs, ...model.outputs])].filter(
    (modality): modality is Exclude<Modality, 'text'> => modality !== 'text',
  );
  if (extra.length === 0) {
    return null;
  }
  return (
    <View
      className="flex-row items-center gap-1.5"
      accessibilityLabel={extra.map((modality) => MODALITY_NAMES[modality]).join(', ')}
    >
      {extra.map((modality) => (
        <ModalityIcon key={modality} modality={modality} />
      ))}
    </View>
  );
}

interface ModelRowProps {
  readonly model: ModelChoice;
  readonly selected: boolean;
  readonly favourite: boolean;
  readonly onPick: (() => void) | null;
  readonly onFavourite: (() => void) | null;
}

function RowBody({
  model,
  selected,
}: {
  readonly model: ModelChoice;
  readonly selected: boolean;
}): ReactNode {
  return (
    <>
      <ProviderLogo provider={model.provider} name={model.providerLabel} />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {model.name}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
            {detailsOf(model)}
          </Text>
          <Modalities model={model} />
        </View>
      </View>
      <Price model={model} />
      {selected ? <Icon name="check" size={20} tone="primary" /> : null}
    </>
  );
}

export function ModelRow({
  model,
  selected,
  favourite,
  onPick,
  onFavourite,
}: ModelRowProps): ReactNode {
  return (
    <View
      className={cn(
        'h-model-row flex-row items-center rounded-lg',
        selected && 'bg-primary-container',
      )}
    >
      <Interactive
        label={model.name}
        selected={selected}
        {...(onPick === null ? { role: 'none' as const } : { onPress: onPick })}
        className="h-full min-w-0 flex-1 flex-row items-center gap-3 rounded-lg px-3"
        layerClassName="rounded-lg"
      >
        <RowBody model={model} selected={selected} />
      </Interactive>
      {onFavourite === null ? null : (
        <IconButton
          icon="star"
          label={favourite ? `Unfavourite ${model.name}` : `Favourite ${model.name}`}
          selected={favourite}
          onPress={onFavourite}
        />
      )}
    </View>
  );
}
