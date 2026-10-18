import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { useKeyboardRow } from '../../../../components/keyboard-list';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { useIdiom } from '../../../../design/platform';
import { useMoney } from '../../../region';
import { contextText } from '../../data/cost';
import { capabilitiesOf } from '../library/library-row';
import type { LibraryRow } from '../library/library-rows';
import { CapabilityIcon, priceOf } from '../model-row';
import { ProviderLogo } from '../provider-logo';

const BRANCH_NOTE = 'continues in a new branch';

export interface PanelRowProps {
  readonly row: LibraryRow;
  readonly branches: boolean;
  readonly onFavourite: ((id: string) => void) | null;
}

function Detail({ row, branches }: Pick<PanelRowProps, 'row' | 'branches'>): ReactNode {
  const money = useMoney();
  const { model } = row.candidate;
  if (row.reason !== null) {
    return (
      <View className="flex-row items-center gap-1">
        <Icon name="warning" size={16} tone="warning" />
        <Text variant="footnote" tone="warning" numberOfLines={1} className="min-w-0 shrink">
          {row.reason}
        </Text>
      </View>
    );
  }
  const parts = [
    model.providerLabel,
    row.where,
    contextText(model.contextLength),
    priceOf(model, money),
    branches ? BRANCH_NOTE : null,
  ].filter((part) => part !== null);
  return (
    <Text variant="footnote" tone="variant" numberOfLines={1}>
      {parts.join(' · ')}
    </Text>
  );
}

function labelOf(row: LibraryRow, branches: boolean): string {
  const { model, selected } = row.candidate;
  return [
    model.name,
    model.providerLabel,
    selected ? 'current' : null,
    row.reason,
    branches ? BRANCH_NOTE : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
}

function RowText({ row, branches }: Pick<PanelRowProps, 'row' | 'branches'>): ReactNode {
  const { model, selected } = row.candidate;
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
        <Detail row={row} branches={branches} />
      </View>
    </>
  );
}

function PanelRowView({ row, branches, onFavourite }: PanelRowProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const keyboard = useKeyboardRow(row.key);
  const { model, selected, favourite, pick } = row.candidate;
  return (
    <View
      nativeID={keyboard.nativeID}
      className={cn(
        'flex-row items-center rounded-md',
        touch ? 'min-h-16' : 'min-h-13',
        selected ? 'bg-primary-container' : keyboard.highlighted && 'bg-surface-2',
      )}
    >
      <Interactive
        label={labelOf(row, branches)}
        selected={selected}
        {...(pick === null ? { role: 'none' as const } : { onPress: pick })}
        className={cn(
          'min-w-0 flex-1 flex-row items-center gap-3 rounded-md px-3 py-1.5',
          touch ? 'min-h-16' : 'min-h-13',
        )}
        layerClassName="rounded-md"
      >
        <RowText row={row} branches={branches} />
      </Interactive>
      {onFavourite === null ? null : (
        <IconButton
          icon="star"
          label={`${favourite ? 'Unfavourite' : 'Favourite'} ${model.name}`}
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

function same(left: PanelRowProps, right: PanelRowProps): boolean {
  return (
    left.row.candidate === right.row.candidate &&
    left.row.reason === right.row.reason &&
    left.row.where === right.row.where &&
    left.branches === right.branches &&
    left.onFavourite === right.onFavourite
  );
}

export const PanelRowItem = memo(PanelRowView, same);
