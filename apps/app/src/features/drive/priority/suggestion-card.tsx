import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { DriveGlyph } from '../components/folder-glyph';
import { DriveThumb } from '../components/drive-thumb';
import { thumbReadyOf } from '../model/item-content';
import { REASON_ICON } from './priority-model';
import { sameSuggestionView, type SuggestionView } from './suggestion-views';

function Art({ item }: { readonly item: DriveItem }): ReactNode {
  if (thumbReadyOf(item)) {
    return <DriveThumb item={item} className="h-12 w-16 rounded-sm" />;
  }
  return (
    <View className="h-12 w-16 items-center justify-center rounded-sm bg-surface-3">
      <DriveGlyph item={item} well="s" />
    </View>
  );
}

interface SuggestionCardProps {
  readonly view: SuggestionView;
  readonly fill?: boolean;
}

function SuggestionCardView({ view, fill = false }: SuggestionCardProps): ReactNode {
  const { item, reason } = view.suggestion;
  return (
    <Interactive
      href={view.href}
      label={`${item.name}, ${view.line}`}
      className={cn(
        'flex-row items-center gap-3 rounded-md border-hairline border-outline-variant bg-surface-1 p-2',
        fill ? 'min-w-0 flex-1' : 'w-68',
      )}
      layerClassName="rounded-md"
    >
      <Art item={item} />
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-baseline gap-2">
          <Text variant="footnote" numberOfLines={1} className="min-w-0 flex-1 font-sans-medium">
            {item.name}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {view.when}
          </Text>
        </View>
        <View className="flex-row items-start gap-1">
          <Icon name={REASON_ICON[reason]} size={14} tone="variant" />
          <Text variant="caption" tone="variant" numberOfLines={2} className="min-w-0 flex-1">
            {view.because}
          </Text>
        </View>
      </View>
    </Interactive>
  );
}

function sameCard(left: SuggestionCardProps, right: SuggestionCardProps): boolean {
  return left.fill === right.fill && sameSuggestionView(left.view, right.view);
}

export const SuggestionCard = memo(SuggestionCardView, sameCard);
