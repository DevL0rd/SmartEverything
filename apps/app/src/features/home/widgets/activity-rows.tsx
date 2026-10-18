import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { joinParts } from '../../../format/text';
import { ActivityRow, type ActivityItem } from '../../activity';

export function ActivityRows({
  items,
  count,
  footer,
}: {
  readonly items: readonly ActivityItem[];
  readonly count: number;
  readonly footer: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View className="flex-1 gap-3 overflow-hidden">
      <View className="relative">
        <View
          className={cn(
            'absolute bottom-6 top-6 w-px bg-outline-variant',
            pointer ? 'left-4' : 'left-5',
          )}
        />
        {items.slice(0, count).map((item) => (
          <ActivityRow key={item.id} item={item} time="moment" flush />
        ))}
      </View>
      {footer ? (
        <View className="flex-row">
          <Button label="See all" variant="text" href={href.activity()} />
        </View>
      ) : null}
    </View>
  );
}

export function ActivityLatest({ item }: { readonly item: ActivityItem | undefined }): ReactNode {
  if (item === undefined) {
    return null;
  }
  return (
    <Text variant="footnote" tone="variant" numberOfLines={2}>
      {joinParts([item.name, item.summary])}
    </Text>
  );
}
