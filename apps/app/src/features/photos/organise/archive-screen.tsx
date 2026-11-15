import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { IconWell } from '../../../components/icon-well';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { percentOf } from '../../../format/percent';
import { count } from '../../../format/number';
import { useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { LibraryGrid } from '../library/library-grid';
import { LibraryLoading } from '../library/library-states';
import { useMediaActions } from '../library/use-media-actions';
import { useOrganiseActions, type OrganiseActions } from './actions';
import { archiveSubtitle, shareOf, spanText, yearsOf, type YearCount } from './archive-model';
import { openMetaEdit } from './meta/meta-request';
import { useMonthFeed, type OrganiseFeed } from './month-feed';
import { ARCHIVE_SOURCE } from './queries';
import { PickBar, PickHead, PickRow, type PickAction, type PickBarProps } from './selection-bar';
import { viewerFromParams } from '../viewer/params';

const ARCHIVE_NOTE = 'Archived items stay in albums, search and People and pets.';

function barOf(value: number, years: readonly YearCount[]): { readonly height: `${number}%` } {
  return { height: percentOf(value === 0 ? 0 : Math.max(0.06, shareOf(value, years))) };
}

function YearBars({ years }: { readonly years: readonly YearCount[] }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={years.map((year) => `${year.year}: ${count(year.count)}`).join(', ')}
      className="min-w-40 flex-1 flex-row items-end gap-1"
    >
      {years.map((year) => {
        const bar = barOf(year.count, years);
        return (
          <View key={year.year} className="min-w-0 flex-1 items-center gap-1">
            <View className="h-14 w-full max-w-12 justify-end overflow-hidden rounded-xs bg-surface-2">
              <View className="rounded-xs bg-viz-1" style={bar} />
            </View>
            <Text variant="caption" tone="variant" align="center" numberOfLines={1}>
              {year.year}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ArchiveCard({ feed }: { readonly feed: OrganiseFeed }): ReactNode {
  const years = yearsOf(feed.buckets);
  return (
    <Card className="mb-3">
      <View className="flex-row flex-wrap items-center gap-x-5 gap-y-3">
        <View className="flex-row items-center gap-3">
          <IconWell icon="archive" colour="viz-1" />
          <View className="gap-0.5">
            <Text variant="title-2" className="tabular-nums">
              {count(feed.total)}
            </Text>
            <Text variant="footnote" tone="variant">
              {spanText(years) ?? 'Archived'}
            </Text>
          </View>
        </View>
        <YearBars years={years} />
      </View>
      <Text variant="footnote" tone="variant" className="pt-3">
        {ARCHIVE_NOTE}
      </Text>
    </Card>
  );
}

function Empty(): ReactElement {
  return (
    <EmptyState
      icon="archive"
      title="Nothing archived"
      body="Archive photos to hide them from the Library and Map without deleting them. They stay in albums, search and People and pets."
      action={<Button label="Open Library" variant="tonal" href="/photos" />}
    />
  );
}

const ARCHIVE_VIEWER = viewerFromParams('archive');

interface BodyProps {
  readonly feed: OrganiseFeed;
  readonly controls: MediaSelectionControls;
}

function Body({ feed, controls }: BodyProps): ReactNode {
  const media = useMediaActions();
  const [step, setStep] = useState<MediaZoomStep>('days');
  if (feed.state === 'loading') return <LibraryLoading />;
  if (feed.state === 'error') return <ErrorState error={feed.failed} retry={feed.retry} page />;
  if (feed.state === 'empty') return <Empty />;
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <View className="px-gutter">
        <ArchiveCard feed={feed} />
      </View>
      <LibraryGrid
        tiles={feed.tiles}
        step={step}
        onStep={setStep}
        selection={controls}
        media={media}
        viewer={ARCHIVE_VIEWER}
        empty={<Empty />}
        footer={<View />}
        onEnd={feed.onEnd}
      />
    </View>
  );
}

function pickActions(
  ids: readonly string[],
  actions: OrganiseActions,
  done: () => void,
): readonly PickAction[] {
  return [
    {
      id: 'unarchive',
      label: 'Unarchive',
      short: 'Unarchive',
      icon: 'archiveRestore',
      look: 'primary',
      onPress: (): void => {
        actions.unarchive(ids, done);
      },
    },
    {
      id: 'meta',
      label: 'Edit date and location',
      short: 'Date',
      icon: 'calendar',
      look: 'plain',
      onPress: (): void => {
        openMetaEdit({ itemIds: ids, current: null, onSaved: done });
      },
    },
    {
      id: 'lock',
      label: 'Move to Locked folder',
      short: 'Lock',
      icon: 'lock',
      look: 'plain',
      onPress: (): void => {
        actions.lock(ids, done);
      },
    },
  ];
}

function selectAction(feed: OrganiseFeed, begin: () => void): readonly ShellAction[] {
  return feed.tiles.length === 0 ? [] : [{ icon: 'circleCheck', label: 'Select', onPress: begin }];
}

export function ArchiveScreen(): ReactNode {
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const live = useSyncStatus().status === 'live';
  const feed = useMonthFeed(ARCHIVE_SOURCE);
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const actions = useOrganiseActions();
  const ids = [...controls.selection.ids];
  const bar: PickBarProps = {
    picked: ids.length,
    total: feed.tiles.length,
    disabled: !live || actions.busy,
    actions: pickActions(ids, actions, controls.clear),
    onClear: controls.clear,
    onAll: controls.all,
  };
  const active = controls.selection.active;
  const subtitle = archiveSubtitle(feed.state === 'loading' ? null : feed.total);
  return (
    <PhotosFrame
      active="archive"
      {...(subtitle === null ? {} : { subtitle })}
      scroll={false}
      actions={active ? [] : selectAction(feed, controls.begin)}
      selection={active ? compact ? <PickHead {...bar} /> : <PickBar {...bar} /> : null}
      footer={active && compact ? <PickRow {...bar} /> : null}
      {...(live
        ? {}
        : {
            banner: (
              <Banner
                tone="warning"
                title="The hub is offline"
                body="Archived photos come back when the hub answers."
                wrapBody
              />
            ),
          })}
    >
      {feed.sources}
      <Body feed={feed} controls={controls} />
    </PhotosFrame>
  );
}
