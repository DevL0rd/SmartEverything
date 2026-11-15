import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import { Icon } from '../icon';
import { Interactive } from '../interactive';
import { Text } from '../text';
import type { DayMark } from './selection';

export interface DayHeadProps {
  readonly title: string;
  readonly detail: string;
  readonly place: string | null;
  readonly mark: DayMark | null;
  readonly packed: boolean;
  readonly onMark: () => void;
}

function MarkCheck({
  mark,
  title,
  onMark,
}: {
  readonly mark: DayMark;
  readonly title: string;
  readonly onMark: () => void;
}): ReactNode {
  const all = mark === 'all';
  return (
    <Interactive
      label={all ? `Deselect ${title}` : `Select all of ${title}`}
      role="checkbox"
      checked={mark === 'some' ? 'mixed' : all}
      onPress={onMark}
      className="-my-2 -ml-2 size-touch-min shrink-0 items-center justify-center rounded-full"
      layerClassName="rounded-full"
    >
      <View
        className={cn(
          'size-6 items-center justify-center rounded-full border-2',
          mark === 'none' ? 'border-on-surface-variant' : 'border-primary bg-primary',
        )}
      >
        {mark === 'none' ? null : (
          <Icon name={all ? 'check' : 'minus'} size={16} tone="onPrimary" />
        )}
      </View>
    </Interactive>
  );
}

function Place({ place }: { readonly place: string | null }): ReactNode {
  if (place === null) return null;
  return (
    <View className="min-w-0 shrink flex-row items-center gap-1 self-center">
      <Icon name="mapPin" size={16} tone="variant" />
      <Text variant="callout" tone="variant" numberOfLines={1} className="shrink">
        {place}
      </Text>
    </View>
  );
}

function Head({ title, detail, place, mark, packed, onMark }: DayHeadProps): ReactNode {
  const check = mark === null ? null : <MarkCheck mark={mark} title={title} onMark={onMark} />;
  if (packed) {
    return (
      <View className="flex-row items-center gap-2 pb-2 pt-4">
        {check}
        <View className="min-w-0 flex-1">
          <Text variant="title-3" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="callout" tone="variant" numberOfLines={1} className="tabular-nums">
            {detail}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-2 bg-bg px-gutter pb-2 pt-4">
      {check}
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text variant="title-3" accessibilityRole="header" numberOfLines={1} className="shrink-0">
          {title}
        </Text>
        <Text variant="callout" tone="variant" numberOfLines={1} className="shrink-0 tabular-nums">
          {detail}
        </Text>
        <Place place={place} />
      </View>
    </View>
  );
}

export const DayHead = memo(Head);
