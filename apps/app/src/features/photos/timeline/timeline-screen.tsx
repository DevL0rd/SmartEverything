import type { PhotoTimelineFilter } from '@smarteverything/domain';
import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { HeaderAction } from '../../../components/page-header';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import { notify } from '../../../components/toast-store';
import { useAreaWidth } from '../../../design/size-class';
import { pickFiles, PickerMissingError, type PickedBlob } from '../../../platform/pick-files';
import { useDayKey } from '../../../store/clock';
import { useSyncStatus } from '../../../store/selectors';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoInsights } from '../data';
import { DropZone } from './drop-zone';
import { useLocalLibrary } from '../local/use-local-library';
import { LocalLibraryStatus } from './local-library-status';
import { TimelineGrid } from './timeline-grid';
import { libraryLine } from './timeline-model';
import {
  TimelineActionRow,
  TimelineSelection,
  TimelineSelectionHead,
  type TimelineSelectionProps,
} from './timeline-selection';
import { OfflineBanner, TimelineEmpty, TimelineError, TimelineLoading } from './timeline-states';
import { TimelineFilters, TimelineToolbar } from './timeline-toolbar';
import { UploadPanel } from './upload-panel';
import { uploadFiles } from './uploads';
import { useMediaActions, type MediaActions } from './use-media-actions';
import { useTimelineFeed, type TimelineFeed } from './use-timeline-feed';

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

export function timelineActions(
  compact: boolean,
  controls: MediaSelectionControls,
): readonly HeaderAction[] {
  const search: readonly HeaderAction[] = compact
    ? [{ icon: 'search', label: 'Search photos', iconOnly: true, href: href.photosPage('search') }]
    : [];
  return [
    ...search,
    { icon: 'upload', label: 'Upload', primary: true, iconOnly: compact, onPress: pickAndUpload },
    { icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin },
  ];
}

interface PageProps {
  readonly filter: PhotoTimelineFilter;
  readonly onFilter: (filter: PhotoTimelineFilter) => void;
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
}

function TimelineTop({
  compact,
  filter,
  onFilter,
  step,
  onStep,
}: PageProps & {
  readonly compact: boolean;
}): ReactNode {
  return (
    <View>
      {compact ? null : <TimelineToolbar step={step} onStep={onStep} />}
      <TimelineFilters filter={filter} onFilter={onFilter} line="Newest first" />
    </View>
  );
}

interface BodyProps {
  readonly localLoading: boolean;
  readonly feed: TimelineFeed;
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
  readonly controls: MediaSelectionControls;
  readonly media: MediaActions;
}

function Body({ feed, step, onStep, controls, media, localLoading }: BodyProps): ReactNode {
  if (feed.state === 'error' && feed.tiles.length === 0)
    return <TimelineError onRetry={feed.retry} />;
  if ((feed.state === 'loading' || localLoading) && feed.tiles.length === 0)
    return <TimelineLoading />;
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <TimelineGrid
        tiles={feed.tiles}
        step={step}
        onStep={onStep}
        selection={controls}
        media={media}
        empty={<TimelineEmpty onUpload={pickAndUpload} />}
        footer={
          <View className="px-gutter">
            {feed.failedMore || feed.state === 'error' ? (
              <TimelineError onRetry={feed.retry} />
            ) : null}
          </View>
        }
        onEnd={feed.onEnd}
      />
    </View>
  );
}

export function TimelineScreen(): ReactNode {
  const [filter, setFilter] = useState<PhotoTimelineFilter>('all');
  const [step, setStep] = useState<MediaZoomStep>('days');
  return (
    <TimelinePage key={filter} filter={filter} onFilter={setFilter} step={step} onStep={setStep} />
  );
}

function isOffline(status: ReturnType<typeof useSyncStatus>['status']): boolean {
  return status === 'interrupted' || status === 'refused';
}

function selectionHeadOf(compact: boolean, props: TimelineSelectionProps): ReactElement | null {
  if (!props.controls.selection.active) return null;
  return compact ? <TimelineSelectionHead {...props} /> : <TimelineSelection {...props} />;
}

function TimelinePage({ filter, onFilter, step, onStep }: PageProps): ReactNode {
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const feed = useTimelineFeed({ filter, placeId: null });
  const local = useLocalLibrary();
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const media = useMediaActions();
  const size = usePhotoInsights('all_time').data?.bytes;
  const offline = isOffline(useSyncStatus().status);
  const line = libraryLine(feed.buckets, size, Number(useDayKey().slice(0, 4)));
  const selection: TimelineSelectionProps = { controls, tiles: feed.tiles, media };
  return (
    <PhotosFrame
      active="timeline"
      search={false}
      scroll={false}
      {...(line === null ? {} : { subtitle: line })}
      actions={timelineActions(compact, controls)}
      selection={selectionHeadOf(compact, selection)}
      {...(offline ? { banner: <OfflineBanner seenAt={feed.seenAt} /> } : {})}
    >
      {feed.sources}
      <DropZone onFiles={startUploads}>
        <TimelineTop
          compact={compact}
          filter={filter}
          onFilter={onFilter}
          step={step}
          onStep={onStep}
        />
        <LocalLibraryStatus library={local} />
        <Body
          feed={feed}
          step={step}
          onStep={onStep}
          controls={controls}
          media={media}
          localLoading={local.state === 'loading'}
        />
        {controls.selection.active && compact ? <TimelineActionRow {...selection} /> : null}
        <UploadPanel compact={compact} />
      </DropZone>
    </PhotosFrame>
  );
}
