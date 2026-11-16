import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { ApiError, type LibraryScope, type PhotoGroup } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import { Skeleton } from '../../../components/skeleton';
import { useAreaWidth } from '../../../design/size-class';
import { useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { OFFLINE_BODY, SNAPSHOT_TITLE } from '../model/offline-copy';
import { LibraryGrid } from '../library/library-grid';
import { LibraryError, LibraryLoading } from '../library/library-states';
import { selectionFrameOf, type SelectionExtra } from '../library/library-selection';
import { feedSelectionOf, useLibraryFeed, type LibraryFeed } from '../library/use-library-feed';
import { useMediaActions, type MediaActions } from '../library/use-media-actions';
import { notThisText, usePeopleActions } from './actions';
import { groupTitleOf } from './model';
import { PersonHero, usePersonMenu } from './person-hero';
import { PersonSheets, type PersonSheet } from './person-sheets';
import { usePhotoGroup } from './queries';

const GROUP_ID = z.uuid();

export function groupIdOf(raw: unknown): string | null {
  const parsed = GROUP_ID.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const CRUMBS = [{ label: 'People and pets', href: href.photosPage('people') }] as const;

export function personScopeOf(groupId: string): LibraryScope {
  return { filter: 'all', groupIds: [groupId] };
}

interface GridProps {
  readonly feed: LibraryFeed;
  readonly controls: MediaSelectionControls;
  readonly media: MediaActions;
  readonly hero: ReactNode;
}

function Grid({ feed, controls, media, hero }: GridProps): ReactNode {
  const [step, setStep] = useState<MediaZoomStep>('days');
  const empty = (
    <EmptyState
      icon="image"
      title="No photos left"
      body="Every photo of this group was removed from it."
    />
  );
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      {hero === null ? null : <View className="px-gutter pb-3">{hero}</View>}
      {feed.state === 'loading' ? <LibraryLoading /> : null}
      {feed.state === 'error' ? <LibraryError onRetry={feed.retry} /> : null}
      {feed.state === 'ready' || feed.state === 'empty' ? (
        <LibraryGrid
          tiles={feed.tiles}
          step={step}
          onStep={setStep}
          selection={controls}
          media={media}
          empty={empty}
          footer={<View />}
          onEnd={feed.onEnd}
        />
      ) : null}
    </View>
  );
}

function useNotThis(
  group: PhotoGroup,
  controls: MediaSelectionControls,
  disabled: boolean,
): SelectionExtra {
  const actions = usePeopleActions();
  return {
    id: 'not-this',
    label: notThisText(group.kind),
    short: 'Not this',
    icon: 'circleX',
    disabled: disabled || actions.busy,
    onPress: (ids): void => {
      actions.removeItems(group, ids, (left) => {
        controls.clear();
        if (left === null) router.replace(href.photosPage('people'));
      });
    },
  };
}

const OFFLINE_BANNER = (
  <Banner tone="info" title={SNAPSHOT_TITLE} body={OFFLINE_BODY.person} wrapBody />
);

function PersonBody({
  group,
  live,
}: {
  readonly group: PhotoGroup;
  readonly live: boolean;
}): ReactNode {
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const scope = useMemo(() => personScopeOf(group.id), [group.id]);
  const feed = useLibraryFeed(scope);
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const media = useMediaActions();
  const [sheet, setSheet] = useState<PersonSheet>(null);
  const notThis = useNotThis(group, controls, !live);
  const overflow = usePersonMenu(group, live, setSheet);
  const frame = selectionFrameOf(compact, feedSelectionOf(feed, controls, media, [notThis]));
  const hero = controls.selection.active ? null : (
    <PersonHero group={group} live={live} onReview={controls.begin} />
  );
  const select: readonly ShellAction[] =
    controls.selection.active || feed.tiles.length === 0
      ? []
      : [{ icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin }];
  return (
    <PhotosFrame
      active="people"
      title={groupTitleOf(group)}
      breadcrumbs={CRUMBS}
      actions={select}
      overflow={overflow}
      scroll={false}
      selection={frame.selection}
      footer={frame.footer}
      {...(live ? {} : { banner: OFFLINE_BANNER })}
    >
      {feed.sources}
      <Grid feed={feed} controls={controls} media={media} hero={hero} />
      <PersonSheets
        group={group}
        sheet={sheet}
        onClose={() => {
          setSheet(null);
        }}
      />
    </PhotosFrame>
  );
}

function Missing({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry: () => void;
}): ReactNode {
  return (
    <PhotosFrame active="people" title="Person" breadcrumbs={CRUMBS}>
      {error === null ? (
        <EmptyState
          icon="users"
          title="This person or pet is gone"
          body="They were merged into another group or every photo was removed from them."
          action={
            <Button label="Open People and pets" variant="tonal" href={href.photosPage('people')} />
          }
        />
      ) : (
        <ErrorState error={error} retry={retry} page />
      )}
    </PhotosFrame>
  );
}

function isMissing(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'not_found';
}

export function PersonScreen(): ReactNode {
  const groupId = groupIdOf(useLocalSearchParams()['groupId']);
  const query = usePhotoGroup(groupId);
  const live = useSyncStatus().status === 'live';
  const retry = (): void => {
    background(query.refetch(), 'photos.people.group_refetch_failed');
  };
  if (query.data !== undefined) return <PersonBody group={query.data} live={live} />;
  if (groupId === null || isMissing(query.error)) return <Missing error={null} retry={retry} />;
  if (query.isError) return <Missing error={query.error} retry={retry} />;
  return (
    <PhotosFrame active="people" title="Person" breadcrumbs={CRUMBS}>
      <PersonLoading />
    </PhotosFrame>
  );
}

function PersonLoading(): ReactNode {
  return (
    <View aria-busy accessibilityLabel="Loading this person">
      <View className="flex-row items-center gap-4 rounded-lg border-hairline border-outline-variant bg-surface-1 p-4">
        <Skeleton shape="circle" className="size-24" />
        <View className="min-w-0 flex-1 gap-2">
          <Skeleton shape="line" className="h-3 w-16" />
          <Skeleton shape="block" className="h-control-h w-full" />
          <Skeleton shape="line" className="w-40" />
        </View>
      </View>
      <LibraryLoading />
    </View>
  );
}
