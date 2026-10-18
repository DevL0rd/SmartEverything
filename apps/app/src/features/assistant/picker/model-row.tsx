import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Tooltip } from '../../../components/tooltip';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useMoney, type Money } from '../../region';
import { contextText, pricePerMillionText } from '../data/cost';
import type { ModelChoice } from './model-choice';
import type { ModelRowProps } from './model-row-props';
import { ProviderLogo } from './provider-logo';

export interface Capability {
  readonly icon: IconName;
  readonly label: string;
}

function capabilitiesOf(model: ModelChoice): readonly Capability[] {
  return [
    ...(model.efforts.length === 0 ? [] : [{ icon: 'brain' as const, label: 'Thinking' }]),
    ...(model.inputs.includes('image') ? [{ icon: 'image' as const, label: 'Image input' }] : []),
  ];
}

export function priceOf(model: ModelChoice, money: Money): string | null {
  if (model.billing === 'Subscription') return 'Plan';
  if (model.price.variable) return 'Varies';
  const { inputPerMillion, outputPerMillion } = model.price;
  if (inputPerMillion === null || outputPerMillion === null) return null;
  return `${pricePerMillionText(inputPerMillion, money)} / ${pricePerMillionText(outputPerMillion, money)}`;
}

function sourceLine(model: ModelChoice, money: Money): string {
  return [
    model.providerLabel,
    model.supplierLabel,
    contextText(model.contextLength),
    priceOf(model, money),
  ]
    .filter((part) => part !== undefined && part !== null)
    .join(' · ');
}

export function CapabilityIcon({ capability }: { readonly capability: Capability }): ReactNode {
  const [hovered, setHovered] = useState(false);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={capability.label}
      onPointerEnter={(): void => {
        setHovered(true);
      }}
      onPointerLeave={(): void => {
        setHovered(false);
      }}
    >
      <Icon name={capability.icon} size={16} tone="faint" />
      {hovered ? <Tooltip text={capability.label} placement="above" /> : null}
    </View>
  );
}

function RowBody({
  model,
  selected,
}: {
  readonly model: ModelChoice;
  readonly selected: boolean;
}): ReactNode {
  const money = useMoney();
  return (
    <>
      <ProviderLogo provider={model.provider} name={model.providerLabel} size="s" />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text variant="body-strong" numberOfLines={1} className="min-w-0 shrink">
            {model.name}
          </Text>
          {capabilitiesOf(model).map((capability) => (
            <CapabilityIcon key={capability.label} capability={capability} />
          ))}
          {selected ? <Icon name="check" size={16} tone="primary" /> : null}
        </View>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {sourceLine(model, money)}
        </Text>
      </View>
    </>
  );
}

function Star({
  model,
  favourite,
  shown,
  onPress,
}: {
  readonly model: ModelChoice;
  readonly favourite: boolean;
  readonly shown: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <View className={cn(!shown && 'opacity-0')}>
      <IconButton
        icon="star"
        label={favourite ? `Unfavourite ${model.name}` : `Favourite ${model.name}`}
        selected={favourite}
        onPress={onPress}
      />
    </View>
  );
}

export function ModelRow({
  model,
  selected,
  favourite,
  onPick,
  onFavourite,
}: ModelRowProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [hovered, setHovered] = useState(false);
  const height = pointer ? 'min-h-13' : 'min-h-16';
  return (
    <View
      onPointerEnter={(): void => {
        setHovered(true);
      }}
      onPointerLeave={(): void => {
        setHovered(false);
      }}
      className={cn('flex-row items-center rounded-md', height, selected && 'bg-primary-container')}
    >
      <Interactive
        label={model.name}
        selected={selected}
        {...(onPick === null ? { role: 'none' as const } : { onPress: onPick })}
        className={cn('min-w-0 flex-1 flex-row items-center gap-3 rounded-md px-3 py-1.5', height)}
        layerClassName="rounded-md"
      >
        <RowBody model={model} selected={selected} />
      </Interactive>
      {onFavourite === null ? null : (
        <Star
          model={model}
          favourite={favourite}
          shown={!pointer || hovered || favourite}
          onPress={onFavourite}
        />
      )}
    </View>
  );
}
