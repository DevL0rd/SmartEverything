import type { PhotoInsights } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { ProgressBar, SegmentBar } from '../../../components/charts';
import { ListRow } from '../../../components/list-row';
import { RankedList } from '../../../components/ranked-list';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { useDriveItem } from '../../nas/data/queries';
import { useDriveRoots } from '../../nas/data/tables';
import { NATURAL_EARTH_ATTRIBUTION, WorldMap } from '../world-map';
import { LegendDot } from './insights-charts';
import {
  cameraEntries,
  countryEntries,
  coverageRows,
  folderBars,
  largestNote,
  lensEntries,
  placesLabel,
  type CoverageRow,
  type FolderRow,
} from './lists-model';
import { placesLine } from './model';

export function PlacesCard({ places }: { readonly places: PhotoInsights['places'] }): ReactNode {
  const countries = places.countries.map((country) => ({
    countryCode: country.countryCode,
    count: country.items,
  }));
  return (
    <View className="gap-3">
      <Card
        title="Places"
        padding="card"
        metadata={
          <Text variant="caption" tone="variant" className="tabular">
            {placesLine(places)}
          </Text>
        }
      >
        <WorldMap
          mode="countries"
          countries={countries}
          label={placesLabel(places)}
          attribution={NATURAL_EARTH_ATTRIBUTION}
          className="h-40 rounded-md"
        />
      </Card>
      {places.countries.length === 0 ? null : (
        <RankedList title="Countries" entries={countryEntries(places.countries)} />
      )}
    </View>
  );
}

export function CamerasCard({ insights }: { readonly insights: PhotoInsights }): ReactNode {
  return (
    <View className="gap-3">
      {insights.cameras.length === 0 ? null : (
        <RankedList title="Cameras" entries={cameraEntries(insights.cameras)} />
      )}
      {insights.lenses.length === 0 ? null : (
        <RankedList title="Lenses" entries={lensEntries(insights.lenses)} />
      )}
    </View>
  );
}

function CoverageLine({ row }: { readonly row: CoverageRow }): ReactNode {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
          {row.name}
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {row.note}
        </Text>
        <Text variant="callout" className="tabular">
          {row.value}
        </Text>
      </View>
      <ProgressBar
        progress={row.progress}
        colour={row.progress >= 1 ? 'positive' : 'primary'}
        label={`${row.name} backed up ${row.value}, ${row.note}`}
      />
    </View>
  );
}

export function CoverageCard({
  coverage,
}: {
  readonly coverage: PhotoInsights['backupCoverage'];
}): ReactNode {
  return coverage.length === 0 ? null : (
    <Card title="Backup coverage">
      {coverageRows(coverage).map((row) => (
        <CoverageLine key={row.key} row={row} />
      ))}
    </Card>
  );
}

function LargestRow({
  video,
}: {
  readonly video: PhotoInsights['largestVideos'][number];
}): ReactNode {
  const name = useDriveItem(video.itemId, null).data?.name ?? 'Video';
  return (
    <ListRow
      title={name}
      subtitle={largestNote(video)}
      icon="film"
      chevron
      href={href.photosItem(video.itemId)}
    />
  );
}

export function LargestVideos({
  videos,
}: {
  readonly videos: PhotoInsights['largestVideos'];
}): ReactNode {
  return videos.length === 0 ? null : (
    <List title="Largest videos">
      {videos.map((video) => (
        <LargestRow key={video.itemId} video={video} />
      ))}
    </List>
  );
}

function FolderLine({
  row,
  scale,
}: {
  readonly row: FolderRow;
  readonly scale: number;
}): ReactNode {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <Text variant="callout" ellipsize="middle" className="min-w-0 flex-1">
          {row.label}
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {row.note}
        </Text>
        <Text variant="callout" className="tabular">
          {bytes(row.total)}
        </Text>
      </View>
      <SegmentBar
        segments={row.segments}
        total={scale}
        size="regular"
        label={row.label}
        format={bytes}
      />
    </View>
  );
}

function KindLegend(): ReactNode {
  return (
    <View aria-hidden className="flex-row gap-3">
      <View className="flex-row items-center gap-1.5">
        <LegendDot colour="viz-1" />
        <Text variant="caption" tone="variant">
          Photos
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <LegendDot colour="viz-3" />
        <Text variant="caption" tone="variant">
          Videos
        </Text>
      </View>
    </View>
  );
}

export function FoldersCard({ roots }: { readonly roots: PhotoInsights['roots'] }): ReactNode {
  const known = useDriveRoots();
  const labels = new Map(known.map((root) => [root.id, root.label]));
  const bars = folderBars(roots, (rootId) => labels.get(rootId) ?? 'Library folder');
  if (bars.rows.length === 0) return null;
  return (
    <Card
      title="By library folder"
      metadata={
        <Text variant="caption" tone="variant" className="tabular">
          {bars.summary}
        </Text>
      }
    >
      <KindLegend />
      {bars.rows.map((row) => (
        <FolderLine key={row.key} row={row} scale={bars.scale} />
      ))}
    </Card>
  );
}
