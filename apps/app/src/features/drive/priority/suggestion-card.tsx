import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveSuggestion } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useMinuteOf } from '../../../store/clock';
import { useDriveRoots } from '../data';
import { DriveGlyph } from '../components/folder-glyph';
import { DriveThumb } from '../components/drive-thumb';
import { thumbReadyOf } from '../model/item-content';
import { openHrefOf } from '../recent/recent-model';
import { relative } from '../../../format/time';
import { REASON_ICON, reasonLineOf, reasonOf, type NameOf } from './priority-model';

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

export function SuggestionCard({
  suggestion,
  nameOf,
  fill = false,
}: {
  readonly suggestion: DriveSuggestion;
  readonly nameOf: NameOf;
  readonly fill?: boolean;
}): ReactNode {
  const line = useMinuteOf((now) => reasonLineOf(suggestion, nameOf, now));
  const when = useMinuteOf((now) => relative(suggestion.at, now));
  const roots = useDriveRoots();
  const { item } = suggestion;
  return (
    <Interactive
      href={openHrefOf(item, roots)}
      label={`${item.name}, ${line}`}
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
            {when}
          </Text>
        </View>
        <View className="flex-row items-start gap-1">
          <Icon name={REASON_ICON[suggestion.reason]} size={14} tone="variant" />
          <Text variant="caption" tone="variant" numberOfLines={2} className="min-w-0 flex-1">
            {reasonOf(suggestion, nameOf)}
          </Text>
        </View>
      </View>
    </Interactive>
  );
}

export function suggestionKeyOf(suggestion: DriveSuggestion): string {
  return `${suggestion.item.id}\n${suggestion.reason}\n${suggestion.at}`;
}
