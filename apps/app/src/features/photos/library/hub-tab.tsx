import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveDurationBucket, LibraryScope } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DayText } from '../../../components/media-grid/day-text';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import type { MediaDay, MediaGrouping } from '../../../components/media-grid/tiles';
import type { HeaderAction } from '../../../components/page-header';
import { notify } from '../../../components/toast-store';
import { pickFiles, PickerMissingError, type PickedBlob } from '../../../platform/pick-files';
import { useSyncStatus } from '../../../store/selectors';
import { DurationChips, VideoStatsRow } from '../collections/video-header';
import { bucketMonthTotal, videoMonthText } from '../collections/video-model';
import { usePhotoInsights } from '../data';
import { useLocalLibrary } from '../local/use-local-library';
import { removeLastOf, type LibrarySearch } from '../search/library-search';
import { isSearching } from '../search/query';
import { NoResults } from '../search/no-results';
import { DropZone } from './drop-zone';
import { LibraryGrid } from './library-grid';
import { LibraryShell, type LibraryHeadProps, type ZoomControl } from './library-head';
import {
  LibraryActionRow,
  LibrarySelection,
  LibrarySelectionHead,
  type LibrarySelectionProps,
} from './library-selection';
import { LibraryEmpty, LibraryError, LibraryLoading, OfflineBanner } from './library-states';
import { resultLineOf, type HubTabId } from './library-tabs-view';
import { LocalLibraryStatus } from './local-library-status';
import { ResultLine } from './result-line';
import { UploadPanel } from './upload-panel';
import { uploadFiles } from './uploads';
import { useClearOnChange } from './use-clear-on-change';
import { scopeKeyOf, useLibraryFeed, type LibraryFeed } from './use-library-feed';
import { useMediaActions, type MediaActions } from './use-media-actions';

const log = new Logger('app.photos');

function startUploads(files: readonly PickedBlob[]): void {
  uploadFiles(files).catch((error: unknown) => {
    log.warn('photos.upload.start_failed', { files: files.length });
    notify({ message: 'Could not start the upload', error, tone: 'critical' });
  });
}

function pickAndUpload(): void {
  pickFiles('files')
    .then(startUploads)
    .catch((error: unknown) => {
      notify({
        message: error instanceof PickerMissingError ? error.message : 'Could not open your files',
        error,
        tone: 'critical',
      });
    });
}

export function libraryActions(
  compact: boolean,
  controls: MediaSelectionControls,
): readonly HeaderAction[] {
  return [
    { icon: 'upload', label: 'Upload', primary: true, iconOnly: compact, onPress: pickAndUpload },
    { icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin },
  ];
}

export function selectionHeadOf(
  compact: boolean,
  props: LibrarySelectionProps,
): ReactElement | null {
  if (!props.controls.selection.active) return null;
  return compact ? <LibrarySelectionHead {...props} /> : <LibrarySelection {...props} />;
}

export function isOffline(status: ReturnType<typeof useSyncStatus>['status']): boolean {
  return status === 'interrupted' || status === 'refused';
}

export interface HubTabProps {
  readonly head: LibraryHeadProps;
  readonly tab: HubTabId;
  readonly scope: LibraryScope;
  readonly grouping: MediaGrouping;
  readonly zoom: ZoomControl;
  readonly subtitle: string | null;
}

function VideoTop({
  bucket,
  onBucket,
  compact,
}: {
  readonly bucket: DriveDurationBucket | null;
  readonly onBucket: (bucket: DriveDurationBucket | null) => void;
  readonly compact: boolean;
}): ReactNode {
  const insights = usePhotoInsights('all_time').data;
  const recent = usePhotoInsights('last_12_months').data;
  return (
    <View className="gap-2 pb-2">
      <VideoStatsRow
        insights={insights}
        hours={recent?.hoursAddedPerMonth ?? null}
        compact={compact}
      />
      <DurationChips insights={insights} bucket={bucket} onBucket={onBucket} />
    </View>
  );
}

interface BodyProps {
  readonly page: HubTabProps;
  readonly feed: LibraryFeed;
  readonly controls: MediaSelectionControls;
  readonly media: MediaActions;
  readonly localLoading: boolean;
}

function useMonthHeads(feed: LibraryFeed): (group: MediaDay) => DayText {
  const total = useMemo(() => bucketMonthTotal(feed.buckets), [feed.buckets]);
  return useCallback((group: MediaDay) => videoMonthText(group, total(group.key)), [total]);
}

function EmptyFor({
  search,
  tab,
}: {
  readonly search: LibrarySearch;
  readonly tab: HubTabId;
}): ReactElement {
  if (!isSearching(search.input)) return <LibraryEmpty tab={tab} onUpload={pickAndUpload} />;
  return <NoResults search={search.input} onRemoveLast={removeLastOf(search)} />;
}

function HubResultLine({
  search,
  feed,
}: {
  readonly search: LibrarySearch;
  readonly feed: LibraryFeed;
}): ReactNode {
  if (!isSearching(search.input) || feed.tiles.length === 0) return null;
  return (
    <ResultLine
      text={resultLineOf(feed.buckets)}
      search={search.input}
      onClear={() => {
        search.act({ type: 'clear' });
      }}
    />
  );
}

function waiting(feed: LibraryFeed, localLoading: boolean): boolean {
  return (feed.state === 'loading' || localLoading) && feed.tiles.length === 0;
}

function Body({ page, feed, controls, media, localLoading }: BodyProps): ReactNode {
  const { search } = page.head;
  const monthHeads = useMonthHeads(feed);
  if (feed.state === 'error' && feed.tiles.length === 0) {
    return <LibraryError onRetry={feed.retry} />;
  }
  if (waiting(feed, localLoading)) return <LibraryLoading />;
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <HubResultLine search={search} feed={feed} />
      <LibraryGrid
        tiles={feed.tiles}
        step={page.zoom.step}
        onStep={page.zoom.onStep}
        selection={controls}
        media={media}
        {...(page.tab === 'videos'
          ? { grouping: 'month' as const, headText: monthHeads }
          : { grouping: page.grouping })}
        empty={<EmptyFor search={search} tab={page.tab} />}
        footer={
          <View className="px-gutter">
            {feed.failedMore || feed.state === 'error' ? (
              <LibraryError onRetry={feed.retry} />
            ) : null}
          </View>
        }
        onEnd={feed.onEnd}
      />
    </View>
  );
}

function scopeWith(
  scope: LibraryScope,
  tab: HubTabId,
  bucket: DriveDurationBucket | null,
): LibraryScope {
  return tab === 'videos' && bucket !== null ? { ...scope, duration: bucket } : scope;
}

export function HubTab(props: HubTabProps): ReactNode {
  const { head, tab } = props;
  const [bucket, setBucket] = useState<DriveDurationBucket | null>(null);
  const scope = scopeWith(props.scope, tab, bucket);
  const feed = useLibraryFeed(scope);
  const local = useLocalLibrary();
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  useClearOnChange(scopeKeyOf(scope), controls.clear);
  const media = useMediaActions();
  const offline = isOffline(useSyncStatus().status);
  const selection: LibrarySelectionProps = { controls, tiles: feed.tiles, media };
  const localLoading = tab === 'all' && local.state === 'loading';
  return (
    <LibraryShell
      head={head}
      frame={{
        subtitle: props.subtitle,
        actions: libraryActions(head.compact, controls),
        selection: selectionHeadOf(head.compact, selection),
        banner: offline ? <OfflineBanner seenAt={feed.seenAt} /> : null,
      }}
    >
      {feed.sources}
      <DropZone onFiles={startUploads}>
        {tab === 'videos' ? (
          <VideoTop bucket={bucket} onBucket={setBucket} compact={head.compact} />
        ) : null}
        {tab === 'all' ? <LocalLibraryStatus library={local} /> : null}
        <Body
          page={props}
          feed={feed}
          controls={controls}
          media={media}
          localLoading={localLoading}
        />
        {controls.selection.active && head.compact ? <LibraryActionRow {...selection} /> : null}
        <UploadPanel compact={head.compact} />
      </DropZone>
    </LibraryShell>
  );
}
