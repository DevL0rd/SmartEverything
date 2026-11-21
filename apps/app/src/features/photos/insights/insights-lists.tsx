import {
  PHOTO_RANKING_SUMMARY,
  type PhotoInsightRange,
  type PhotoInsights,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { ProgressBar, SegmentBar } from '../../../components/charts';
import { Interactive } from '../../../components/interactive';
import { ListRow } from '../../../components/list-row';
import { RankedList } from '../../../components/ranked-list';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { bytes } from '../../../format/number';
import { driveLabelOf, useDriveItem, useDriveRoots, useViewerId } from '../../drive';
import { Cover } from '../places/cover';
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
import { RANKING_TITLES, busiestRowOf, type RankingId } from './ranking-model';

const COMPACT_SUMMARY = 5;

function CardRows({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="-mx-card-pad">{children}</View>;
}

function CardRow({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="border-t-hairline border-outline-variant">{children}</View>;
}

export function PlacesCard({
  places,
  className,
}: {
  readonly places: PhotoInsights['places'];
  readonly className: string;
}): ReactNode {
  const countries = places.countries.map((country) => ({
    countryCode: country.countryCode,
    count: country.items,
  }));
  return (
    <View className={cn('gap-3', className)}>
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
        <Card title="Countries">
          <RankedList inCard ellipsize="end" entries={countryEntries(places.countries)} />
        </Card>
      )}
    </View>
  );
}

export function CamerasCard({
  insights,
  className,
}: {
  readonly insights: PhotoInsights;
  readonly className: string;
}): ReactNode {
  if (insights.cameras.length === 0 && insights.lenses.length === 0) return null;
  return (
    <View className={cn('gap-3', className)}>
      {insights.cameras.length === 0 ? null : (
        <Card title="Cameras">
          <RankedList inCard ellipsize="end" entries={cameraEntries(insights.cameras)} />
        </Card>
      )}
      {insights.lenses.length === 0 ? null : (
        <Card title="Lenses">
          <RankedList inCard ellipsize="end" entries={lensEntries(insights.lenses)} />
        </Card>
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
        ticking={false}
      />
    </View>
  );
}

export function CoverageCard({
  coverage,
  className,
}: {
  readonly coverage: PhotoInsights['backupCoverage'];
  readonly className: string;
}): ReactNode {
  return coverage.length === 0 ? null : (
    <Card title="Backup coverage" className={className}>
      {coverageRows(coverage).map((row) => (
        <CoverageLine key={row.key} row={row} />
      ))}
    </Card>
  );
}

function RankNumber({ rank }: { readonly rank: number }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" align="end" className="tabular w-6">
      {String(rank)}
    </Text>
  );
}

function RankLead({ rank, itemId }: { readonly rank: number; readonly itemId: string }): ReactNode {
  return (
    <View className="shrink-0 flex-row items-center gap-3">
      <RankNumber rank={rank} />
      <Cover itemId={itemId} className="size-10 rounded-sm" />
    </View>
  );
}

export function LargestRow({
  video,
  rank,
}: {
  readonly video: PhotoInsights['largestVideos'][number];
  readonly rank: number;
}): ReactNode {
  const name = useDriveItem(video.itemId, null).data?.name ?? 'Video';
  return (
    <ListRow
      title={name}
      titleEllipsize="middle"
      subtitle={largestNote(video)}
      leading={<RankLead rank={rank} itemId={video.itemId} />}
      chevron
      href={href.photosItem(video.itemId)}
    />
  );
}

function ShowAll({
  total,
  shown,
  ranking,
  range,
}: {
  readonly total: number;
  readonly shown: number;
  readonly ranking: RankingId;
  readonly range: PhotoInsightRange;
}): ReactNode {
  return total < PHOTO_RANKING_SUMMARY && shown === total ? null : (
    <Interactive
      label={`Show all ${RANKING_TITLES[ranking].toLowerCase()}`}
      href={href.photosRanking(ranking, range)}
      className="-mr-2 min-h-touch-min justify-center rounded-sm px-2"
      layerClassName="rounded-sm"
    >
      <Text variant="footnote" tone="primary">
        Show all
      </Text>
    </Interactive>
  );
}

function summaryOf<T>(entries: readonly T[], compact: boolean): readonly T[] {
  return compact ? entries.slice(0, COMPACT_SUMMARY) : entries;
}

export function LargestVideos({
  videos,
  range,
  compact,
  className,
}: {
  readonly videos: PhotoInsights['largestVideos'];
  readonly range: PhotoInsightRange;
  readonly compact: boolean;
  readonly className: string;
}): ReactNode {
  const shown = summaryOf(videos, compact);
  return videos.length === 0 ? null : (
    <Card
      title="Largest videos"
      className={className}
      action={
        <ShowAll
          total={videos.length}
          shown={shown.length}
          ranking="largest-videos"
          range={range}
        />
      }
    >
      <CardRows>
        {shown.map((video, index) => (
          <CardRow key={video.itemId}>
            <LargestRow video={video} rank={index + 1} />
          </CardRow>
        ))}
      </CardRows>
    </Card>
  );
}

export function BusiestDayRow({
  entry,
  range,
  rank,
}: {
  readonly entry: PhotoInsights['busiestDays'][number];
  readonly range: PhotoInsightRange;
  readonly rank: number;
}): ReactNode {
  const row = busiestRowOf(entry, range);
  return (
    <ListRow
      title={row.title}
      value={row.note}
      leading={<RankNumber rank={rank} />}
      label={`${row.title}, ${row.note}`}
      chevron
      href={href.photos({ month: entry.day.slice(0, 7) })}
    />
  );
}

export function BusiestDays({
  days,
  range,
  compact,
  className,
}: {
  readonly days: PhotoInsights['busiestDays'];
  readonly range: PhotoInsightRange;
  readonly compact: boolean;
  readonly className: string;
}): ReactNode {
  const shown = summaryOf(days, compact);
  return days.length === 0 ? null : (
    <Card
      title="Busiest days"
      className={className}
      action={
        <ShowAll total={days.length} shown={shown.length} ranking="busiest-days" range={range} />
      }
    >
      <CardRows>
        {shown.map((entry, index) => (
          <CardRow key={entry.day}>
            <BusiestDayRow entry={entry} range={range} rank={index + 1} />
          </CardRow>
        ))}
      </CardRows>
    </Card>
  );
}

function FolderLine({
  row,
  scale,
  compact,
}: {
  readonly row: FolderRow;
  readonly scale: number;
  readonly compact: boolean;
}): ReactNode {
  const note = (
    <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
      {row.note}
    </Text>
  );
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text variant="callout" ellipsize="middle">
            {row.label}
          </Text>
          {compact ? note : null}
        </View>
        {compact ? null : note}
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

export function FoldersCard({
  roots,
  compact,
  className,
}: {
  readonly roots: PhotoInsights['roots'];
  readonly compact: boolean;
  readonly className: string;
}): ReactNode {
  const known = useDriveRoots();
  const viewerId = useViewerId();
  const labels = new Map(known.map((root) => [root.id, driveLabelOf(root, viewerId)]));
  const bars = folderBars(roots, (rootId) => labels.get(rootId) ?? 'Shared with you');
  if (bars.rows.length === 0) return null;
  return (
    <Card
      title="By drive"
      className={className}
      metadata={
        <Text variant="caption" tone="variant" className="tabular">
          {bars.summary}
        </Text>
      }
    >
      <KindLegend />
      {bars.rows.map((row) => (
        <FolderLine key={row.key} row={row} scale={bars.scale} compact={compact} />
      ))}
    </Card>
  );
}
