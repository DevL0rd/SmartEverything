import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Tooltip } from '../../../components/tooltip';
import { cn } from '../../../design/cn';
import { useMoney } from '../../region';
import { contextText, pricePerMillionText } from '../data/cost';
import type { Modality, ModelChoice } from './model-choice';
import { ProviderLogo } from './provider-logo';

function Price({ model }: { readonly model: ModelChoice }): ReactNode {
  const money = useMoney();
  if (model.billing === 'Subscription')
    return (
      <Text variant="caption" tone="variant">
        Subscription
      </Text>
    );
  const price = (value: number | null): string => {
    if (model.price.variable) return 'Varies';
    return value === null ? 'Unknown' : pricePerMillionText(value, money);
  };
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
      <Text variant="caption" tone="variant">{`Input ${price(model.price.inputPerMillion)}`}</Text>
      <Text
        variant="caption"
        tone="variant"
      >{`Output ${price(model.price.outputPerMillion)}`}</Text>
      <Text variant="caption" tone="faint">
        per 1M tokens
      </Text>
    </View>
  );
}
const MODALITY_ICONS: Readonly<Record<Modality, IconName>> = {
  text: 'fileText',
  image: 'image',
  audio: 'mic',
  video: 'film',
  file: 'fileText',
};
function ModalityIcon({
  modality,
  direction,
}: {
  readonly modality: Modality;
  readonly direction: 'input' | 'output';
}): ReactNode {
  const [hovered, setHovered] = useState(false);
  const label = `${modality} ${direction}`;
  return (
    <View
      accessible
      accessibilityLabel={label}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      className="flex-row items-center gap-0.5"
    >
      <Icon name={direction === 'input' ? 'arrowRight' : 'arrowLeft'} size={16} tone="faint" />
      <Icon name={MODALITY_ICONS[modality]} size={16} tone="variant" />
      {hovered ? <Tooltip text={label} /> : null}
    </View>
  );
}
function Details({ model }: { readonly model: ModelChoice }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
      <Text variant="caption" tone="variant" className="rounded-sm bg-surface-2 px-1.5">
        {contextText(model.contextLength) ?? 'Context unknown'}
      </Text>
      {model.efforts.length === 0 ? null : (
        <View className="flex-row items-center gap-1">
          <Icon name="brain" size={16} tone="variant" />
          <Text variant="caption" tone="variant">
            Thinking
          </Text>
        </View>
      )}
      {model.inputs.map((modality) => (
        <ModalityIcon key={`in:${modality}`} modality={modality} direction="input" />
      ))}
      {model.outputs.map((modality) => (
        <ModalityIcon key={`out:${modality}`} modality={modality} direction="output" />
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
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
            {model.name}
          </Text>
          {model.latest ? (
            <Text variant="caption" tone="primary">
              Default
            </Text>
          ) : null}
          {selected ? <Icon name="check" size={20} tone="primary" /> : null}
        </View>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {model.supplierLabel === undefined
            ? model.providerLabel
            : `${model.providerLabel} · ${model.supplierLabel}`}
        </Text>
        <Details model={model} />
        <Price model={model} />
      </View>
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
        'min-h-24 flex-row items-center rounded-lg',
        selected && 'bg-primary-container',
      )}
    >
      <Interactive
        label={model.name}
        selected={selected}
        {...(onPick === null ? { role: 'none' as const } : { onPress: onPick })}
        className="min-h-24 min-w-0 flex-1 flex-row items-center gap-3 rounded-lg px-3 py-2"
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
