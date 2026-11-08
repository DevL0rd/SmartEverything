import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveDurationBucket, TimelineBucket } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { DayText } from '../../../components/media-grid/day-text';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import type { MediaDay } from '../../../components/media-grid/tiles';
import type { HeaderAction } from '../../../components/page-header';
import { useAreaWidth } from '../../../design/size-class';
import { useDayKey } from '../../../store/clock';
import { useSyncStatus } from '../../../store/selectors';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoInsights, usePhotoRailCounts } from '../data';
import { TimelineGrid } from '../timeline/timeline-grid';
import {
  TimelineActionRow,
  TimelineSelection,
  TimelineSelectionHead,
  type TimelineSelectionProps,
} from '../timeline/timeline-selection';
import { OfflineBanner, TimelineError, TimelineLoading } from '../timeline/timeline-states';
import { useMediaActions, type MediaActions } from '../timeline/use-media-actions';
import { useTimelineFeed } from '../timeline/use-timeline-feed';
import {
  collectionCountOf,
  COLLECTIONS,
  screenshotLineOf,
  type CollectionId,
} from './collection-model';
import { CollectionLine, CollectionToolbar } from './collection-toolbar';
import {
  bucketMonthTotal,
  useDurationFeed,
  type CollectionFeed,
  type MonthTotal,
} from './use-duration-feed';
import { DurationChips, VideoStatsRow } from './video-header';
import { videoLineOf, videoMonthText } from './video-model';

interface PageProps {
  readonly id: CollectionId;
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
  readonly bucket: DriveDurationBucket | null;
  readonly onBucket: (bucket: DriveDurationBucket | null) => void;
}

type PageWithLine = PageProps & { readonly line: string | null };

function actionsOf(compact: boolean, controls: MediaSelectionControls): readonly HeaderAction[] {
  const search: readonly HeaderAction[] = compact
    ? [{ icon: 'search', label: 'Search photos', iconOnly: true, href: href.photosPage('search') }]
    : [];
  return [
    ...search,
    { icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin },
  ];
}

function CollectionEmpty({ id }: { readonly id: CollectionId }): ReactElement {
  const spec = COLLECTIONS[id];
  return (
    <View className="items-center pt-6">
      <EmptyState
        icon={spec.emptyIcon}
        title={spec.emptyTitle}
        body={spec.emptyBody}
        action={<Button label="Open Timeline" variant="tonal" href={href.photos()} />}
      />
    </View>
  );
}

function VideoTop({
  bucket,
  onBucket,
  compact,
}: Pick<PageProps, 'bucket' | 'onBucket'> & { readonly compact: boolean }): ReactNode {
  const insights = usePhotoInsights('all_time').data;
  const recent = usePhotoInsights('last_12_months').data;
  return (
    <>
      <VideoStatsRow
        insights={insights}
        hours={recent?.hoursAddedPerMonth ?? null}
        compact={compact}
      />
      <DurationChips insights={insights} bucket={bucket} onBucket={onBucket} />
    </>
  );
}

function Top(props: PageWithLine & { readonly compact: boolean }): ReactNode {
  const { id, step, onStep, compact, line } = props;
  const spec = COLLECTIONS[id];
  return (
    <View className="gap-3">
      {compact ? null : <CollectionToolbar hint={spec.search} step={step} onStep={onStep} />}
      {id === 'videos' ? (
        <VideoTop bucket={props.bucket} onBucket={props.onBucket} compact={compact} />
      ) : null}
      {line === null ? null : <CollectionLine text={line} />}
    </View>
  );
}

interface BodyProps {
  readonly id: CollectionId;
  readonly feed: CollectionFeed;
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
  readonly controls: MediaSelectionControls;
  readonly media: MediaActions;
}

function useMonthHeads(total: MonthTotal): (group: MediaDay) => DayText {
  return useCallback(
    (group: MediaDay) => videoMonthText(group, total(group.key, group.tiles.length)),
    [total],
  );
}

function Body({ id, feed, step, onStep, controls, media }: BodyProps): ReactNode {
  const monthHeads = useMonthHeads(feed.monthTotal);
  if (feed.state === 'error') return <TimelineError onRetry={feed.retry} />;
  if (feed.state === 'loading') return <TimelineLoading />;
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <TimelineGrid
        tiles={feed.tiles}
        step={step}
        onStep={onStep}
        selection={controls}
        media={media}
        {...(id === 'videos' ? { grouping: 'month' as const, headText: monthHeads } : {})}
        empty={<CollectionEmpty id={id} />}
        footer={
          <View className="px-gutter">
            {feed.failedMore ? <TimelineError onRetry={feed.retry} /> : null}
          </View>
        }
        onEnd={feed.onEnd}
      />
    </View>
  );
}

function selectionHeadOf(compact: boolean, props: TimelineSelectionProps): ReactElement | null {
  if (!props.controls.selection.active) return null;
  return compact ? <TimelineSelectionHead {...props} /> : <TimelineSelection {...props} />;
}

function isOffline(status: ReturnType<typeof useSyncStatus>['status']): boolean {
  return status === 'interrupted' || status === 'refused';
}

function useSubtitle(id: CollectionId): Partial<{ readonly subtitle: string }> {
  const counts = usePhotoRailCounts().data;
  const insights = usePhotoInsights('all_time').data;
  const line = id === 'videos' ? videoLineOf(insights) : collectionCountOf(id, counts);
  return line === null ? {} : { subtitle: line };
}

function CollectionPage(props: PageWithLine & { readonly feed: CollectionFeed }): ReactNode {
  const { id, feed, step, onStep } = props;
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const media = useMediaActions();
  const offline = isOffline(useSyncStatus().status);
  const subtitle = useSubtitle(id);
  const selection: TimelineSelectionProps = { controls, tiles: feed.tiles, media };
  return (
    <PhotosFrame
      search={false}
      active={id}
      scroll={false}
      {...subtitle}
      actions={actionsOf(compact, controls)}
      selection={selectionHeadOf(compact, selection)}
      {...(offline ? { banner: <OfflineBanner seenAt={feed.seenAt} /> } : {})}
    >
      {feed.sources}
      <Top {...props} compact={compact} />
      <Body id={id} feed={feed} step={step} onStep={onStep} controls={controls} media={media} />
      {controls.selection.active && compact ? <TimelineActionRow {...selection} /> : null}
    </PhotosFrame>
  );
}

function useLine(id: CollectionId, buckets: readonly TimelineBucket[]): string | null {
  const insights = usePhotoInsights('all_time').data;
  const today = useDayKey();
  return id === 'screenshots' ? screenshotLineOf(insights, buckets, today) : COLLECTIONS[id].line;
}

function TimelineCollection(props: PageProps): ReactNode {
  const timeline = useTimelineFeed({ filter: COLLECTIONS[props.id].filter, placeId: null });
  const monthTotal = useMemo(() => bucketMonthTotal(timeline.buckets), [timeline.buckets]);
  const line = useLine(props.id, timeline.buckets);
  return <CollectionPage {...props} line={line} feed={{ ...timeline, monthTotal }} />;
}

function DurationCollection(
  props: PageProps & { readonly bucket: DriveDurationBucket },
): ReactNode {
  const feed = useDurationFeed(props.bucket);
  return <CollectionPage {...props} line={COLLECTIONS[props.id].line} feed={feed} />;
}

export function CollectionScreen({ id }: { readonly id: CollectionId }): ReactNode {
  const [step, setStep] = useState<MediaZoomStep>('days');
  const [bucket, setBucket] = useState<DriveDurationBucket | null>(null);
  const page = { id, step, onStep: setStep, bucket, onBucket: setBucket };
  return bucket === null ? (
    <TimelineCollection key="all" {...page} />
  ) : (
    <DurationCollection key={bucket} {...page} bucket={bucket} />
  );
}
