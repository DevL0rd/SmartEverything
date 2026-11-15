import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { smartLinkOf } from './model';
import { PHOTOS_SMART_PAGE } from './page';
import { usePhotoAiStatus } from './queries';

export function SmartLinkCard(): ReactNode {
  const status = usePhotoAiStatus().data;
  const view = status === undefined ? null : smartLinkOf(status);
  return (
    <Card
      href={href.settings.page(PHOTOS_SMART_PAGE)}
      label="Smart features"
      className="min-w-0 flex-1"
    >
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-full bg-primary-container">
          <Icon name="sparkles" size={20} tone="primary" />
        </View>
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          Smart features
        </Text>
        <Icon name="chevronRight" size={20} tone="variant" />
      </View>
      {view === null ? (
        <View aria-busy className="gap-2">
          <Skeleton shape="text" />
          <Skeleton shape="line" className="h-2" />
        </View>
      ) : (
        <View className="gap-1">
          <Text variant="title-3" numberOfLines={1} className="tabular-nums">
            {view.headline}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {view.detail}
          </Text>
          <ProgressBar progress={view.progress} colour="viz-1" label="Photos analysed so far" />
        </View>
      )}
    </Card>
  );
}
