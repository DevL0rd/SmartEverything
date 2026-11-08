import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PlaceCluster, PlaceCountry } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { tilesOfPage } from '../../../components/media-grid/tiles';
import { Text } from '../../../components/text';
import { usePhotoBuckets, usePhotoMonth } from '../data';
import { Cover } from './cover';
import { clusterCovers, clusterLine, clusterSummary, spanLine } from './place-model';
import { monthsOf } from './time-range';

export interface ClusterCardProps {
  readonly cluster: PlaceCluster;
  readonly countries: readonly PlaceCountry[];
  readonly onZoom: () => void;
  readonly onClose: () => void;
}

interface CardBodyProps extends ClusterCardProps {
  readonly span: string | null;
  readonly more: readonly string[];
  readonly action: ReactNode;
}

function coverClass(index: number): string {
  return index === 0 ? 'h-18 flex-2 rounded-md' : 'h-18 flex-1 rounded-md';
}

function CardBody({ cluster, countries, onClose, span, more, action }: CardBodyProps): ReactNode {
  const summary = clusterSummary(cluster, countries);
  return (
    <View className="gap-2 rounded-lg border-hairline border-outline-variant bg-surface-raised p-2.5">
      <View className="flex-row items-start gap-1">
        {clusterCovers(cluster, countries, more).map((id, index) => (
          <Cover key={id} itemId={id} className={coverClass(index)} />
        ))}
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="label" numberOfLines={1}>
            {summary.title}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={2} className="tabular-nums">
            {clusterLine(cluster, span, summary.places)}
          </Text>
        </View>
        {action}
      </View>
    </View>
  );
}

interface PlaceCardProps extends ClusterCardProps {
  readonly placeId: number;
}

function openAction(placeId: number): ReactNode {
  return <Button label="Open" variant="tonal" href={href.photosPlace(String(placeId))} />;
}

function MonthCovers({
  month,
  span,
  ...props
}: PlaceCardProps & { readonly month: string; readonly span: string | null }): ReactNode {
  const pages = usePhotoMonth(month, { filter: 'all', placeId: props.placeId }, true).data;
  return (
    <CardBody
      {...props}
      span={span}
      more={pages === undefined ? [] : pages.pages.flatMap(tilesOfPage).map((tile) => tile.id)}
      action={openAction(props.placeId)}
    />
  );
}

function PlaceClusterCard(props: PlaceCardProps): ReactNode {
  const buckets = usePhotoBuckets({ filter: 'all', placeId: props.placeId }).data;
  const month = buckets === undefined ? undefined : monthsOf(buckets).at(-1)?.month;
  if (buckets === undefined || month === undefined) {
    return <CardBody {...props} span={null} more={[]} action={openAction(props.placeId)} />;
  }
  return <MonthCovers {...props} month={month} span={spanLine(buckets)} />;
}

export function ClusterCard(props: ClusterCardProps): ReactNode {
  const placeId = props.cluster.placeId;
  if (placeId !== null) return <PlaceClusterCard {...props} placeId={placeId} />;
  return (
    <CardBody
      {...props}
      span={null}
      more={[]}
      action={<Button label="Zoom in here" variant="tonal" icon="plus" onPress={props.onZoom} />}
    />
  );
}
