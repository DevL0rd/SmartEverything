import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router } from 'expo-router';
import {
  tokensOf,
  type DriveItem,
  type DriveQuery,
  type SmartRule,
  type SmartRuleLeaf,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../app-shell/hrefs';
import type { AppHref } from '../components/app-href';
import { Button } from '../components/button';
import { IconWell } from '../components/icon-well';
import { Interactive } from '../components/interactive';
import { ListRow } from '../components/list-row';
import { Section, SectionAction } from '../components/section';
import { Skeleton } from '../components/skeleton';
import { Text } from '../components/text';
import { cn } from '../design/cn';
import { DURATION } from '../design/motion';
import { compact, count } from '../format/number';
import { joinParts } from '../format/text';
import { useSyncStatus } from '../store/selectors';
import { DriveThumb } from '../features/drive/folder/folder-list';
import { drivePathOf } from '../features/drive/model/drive-chip';
import { KIND_LOOK, openHrefOf } from '../features/drive/recent/recent-model';
import { useSaveSmartFolder } from '../features/drive/starred';
import { flattenPages, useDriveChips, useDriveRoots, useDriveSearch } from '../features/drive';
import { rangeIn } from './match';
import { useRecentSearches } from './recent';
import type { RowEdge } from './result-rows';
import { RowFrame, type ResultsLook } from './row-frame';

export const DRIVE_GROUP_LABEL = 'Photos and files';

const FILE_ROWS = 5;

const TILE_PX = 96;

const TILE_GAP_PX = 4;

const WORD = /[\p{L}\p{N}\p{M}]+/gu;

export function driveWordsOf(query: string): readonly string[] {
  return query.match(WORD) ?? [];
}

export function driveSearchOf(query: string): Omit<DriveQuery, 'cursor'> {
  return {
    text: query.trim(),
    rootId: null,
    folderId: null,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'modifiedAt', direction: 'desc' },
  };
}

export function driveSmartRuleOf(query: string): SmartRule | null {
  const words = driveWordsOf(query);
  return words.length === 0
    ? null
    : {
        match: 'all',
        rules: words.map((contains): SmartRuleLeaf => ({ kind: 'text', field: 'path', contains })),
      };
}

export interface DriveHits {
  readonly photos: readonly DriveItem[];
  readonly files: readonly DriveItem[];
}

export function splitDriveHits(items: readonly DriveItem[]): DriveHits {
  const photo = (item: DriveItem): boolean => item.kind === 'image' || item.kind === 'video';
  return { photos: items.filter(photo), files: items.filter((item) => !photo(item)) };
}

export interface DriveStrip {
  readonly shown: readonly DriveItem[];
  readonly rest: string | null;
}

export function driveStripOf(
  photos: readonly DriveItem[],
  width: number,
  more: boolean,
): DriveStrip {
  const fit = Math.max(1, Math.floor((width + TILE_GAP_PX) / (TILE_PX + TILE_GAP_PX)));
  if (photos.length <= fit && !more) {
    return { shown: photos, rest: null };
  }
  const shown = photos.slice(0, fit - 1);
  const hidden = photos.length - shown.length;
  return { shown, rest: more ? `${compact(hidden)}+` : `+${compact(hidden)}` };
}

export function driveFoundText(found: number, more: boolean): string {
  return more ? `${count(found)}+ in Drive` : `${count(found)} in Drive`;
}

export type DriveGroupState = 'hidden' | 'offline' | 'looking' | 'failed' | 'empty' | 'found';

export function driveGroupStateOf(signals: {
  readonly searchable: boolean;
  readonly live: boolean;
  readonly answered: boolean;
  readonly failed: boolean;
  readonly found: number;
}): DriveGroupState {
  if (!signals.searchable) return 'hidden';
  if (!signals.live) return 'offline';
  if (signals.failed) return 'failed';
  if (!signals.answered) return 'looking';
  return signals.found === 0 ? 'empty' : 'found';
}

export function fileEdgeOf(index: number, total: number): RowEdge {
  if (total === 1) return 'only';
  if (index === 0) return 'first';
  return index === total - 1 ? 'last' : 'middle';
}

interface DriveResultsProps {
  readonly query: string;
  readonly look: ResultsLook;
  readonly onDone: () => void;
}

type Open = (link: AppHref) => void;

function useOpen(query: string, onDone: () => void): Open {
  const { note } = useRecentSearches();
  return (link): void => {
    note(query);
    onDone();
    router.navigate(link);
  };
}

function PhotoTile({ item, open }: { readonly item: DriveItem; readonly open: Open }): ReactNode {
  return (
    <Interactive
      label={`Open ${item.name}`}
      onPress={() => {
        open(href.photosItem(item.id));
      }}
      className="rounded-sm"
    >
      <DriveThumb item={item} className="h-16 w-24 rounded-sm" />
    </Interactive>
  );
}

interface StripProps {
  readonly photos: readonly DriveItem[];
  readonly more: boolean;
  readonly query: string;
  readonly look: ResultsLook;
  readonly open: Open;
}

function PhotoStrip({ photos, more, query, look, open }: StripProps): ReactNode {
  const [width, setWidth] = useState(0);
  const strip = driveStripOf(photos, width, more);
  const measure = (event: LayoutChangeEvent): void => {
    setWidth(event.nativeEvent.layout.width);
  };
  const rest = width === 0 ? null : strip.rest;
  return (
    <View onLayout={measure} className={cn('flex-row gap-1 pb-1', look === 'popover' && 'px-4')}>
      {width === 0
        ? null
        : strip.shown.map((item) => <PhotoTile key={item.id} item={item} open={open} />)}
      {rest === null ? null : (
        <Interactive
          label={`Show ${rest} more in Photos`}
          onPress={() => {
            open(href.photos({ q: query.trim() }));
          }}
          className="h-16 w-24 items-center justify-center rounded-sm bg-surface-3"
        >
          <Text variant="footnote" className="tabular">
            {rest}
          </Text>
        </Interactive>
      )}
    </View>
  );
}

function FileLeading({ item }: { readonly item: DriveItem }): ReactNode {
  if (item.kind !== 'folder' && item.thumb.state === 'ready') {
    return <DriveThumb item={item} className="size-8 rounded-sm" />;
  }
  const look = KIND_LOOK[item.kind];
  return <IconWell icon={look.icon} colour={look.colour} size="s" />;
}

interface FileRowsProps {
  readonly files: readonly DriveItem[];
  readonly query: string;
  readonly look: ResultsLook;
  readonly open: Open;
}

function FileRows({ files, query, look, open }: FileRowsProps): ReactNode {
  const drives = useDriveRoots();
  const chipOf = useDriveChips();
  const tokens = tokensOf(query);
  return files.map((item, index) => {
    const where = drivePathOf(chipOf(item.rootId), item.relPath);
    return (
      <RowFrame
        key={item.id}
        look={look}
        edge={fileEdgeOf(index, files.length)}
        depth={0}
        selected={false}
      >
        <ListRow
          title={item.name}
          titleHighlight={rangeIn(item.name, tokens)}
          leading={<FileLeading item={item} />}
          label={joinParts([`Open ${item.name}`, where])}
          onPress={() => {
            open(openHrefOf(item, drives));
          }}
          {...(where === '' ? {} : { subtitle: where })}
        />
      </RowFrame>
    );
  });
}

function MoreFiles(props: {
  readonly hidden: number;
  readonly total: number;
  readonly fetchMore: (() => void) | null;
  readonly onShowAll: () => void;
}): ReactNode {
  if (props.hidden > 0) {
    const label = `Show all ${count(props.total)}`;
    return (
      <Interactive
        label={label}
        onPress={props.onShowAll}
        className="min-h-touch-min justify-center px-4"
      >
        <Text variant="callout" tone="primary">
          {label}
        </Text>
      </Interactive>
    );
  }
  return props.fetchMore === null ? null : (
    <View className="flex-row px-2">
      <Button label="Find more matches" variant="text" onPress={props.fetchMore} />
    </View>
  );
}

function GroupNote(props: { readonly text: string; readonly onRetry?: () => void }): ReactNode {
  return (
    <View className="min-h-touch-min flex-row flex-wrap items-center gap-2 px-4">
      <Text variant="footnote" tone="variant" className="min-w-0 shrink">
        {props.text}
      </Text>
      {props.onRetry === undefined ? null : (
        <Button label="Try again" variant="text" onPress={props.onRetry} />
      )}
    </View>
  );
}

function Looking(): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-4 px-4">
      <Skeleton shape="block" className="size-8 rounded-sm" />
      <Skeleton shape="text" className="w-40" />
    </View>
  );
}

interface FoundProps {
  readonly hits: DriveHits;
  readonly more: boolean;
  readonly fetchMore: (() => void) | null;
  readonly query: string;
  readonly look: ResultsLook;
  readonly open: Open;
}

function Found(props: FoundProps): ReactNode {
  const [all, setAll] = useState(false);
  const { photos, files } = props.hits;
  const shown = all ? files : files.slice(0, FILE_ROWS);
  return (
    <Animated.View entering={FadeIn.duration(DURATION.short)} className="gap-1">
      {photos.length === 0 ? null : (
        <PhotoStrip
          photos={photos}
          more={props.more}
          query={props.query}
          look={props.look}
          open={props.open}
        />
      )}
      <FileRows files={shown} query={props.query} look={props.look} open={props.open} />
      <MoreFiles
        hidden={files.length - shown.length}
        total={files.length}
        fetchMore={props.fetchMore}
        onShowAll={() => {
          setAll(true);
        }}
      />
    </Animated.View>
  );
}

interface DriveGroup {
  readonly state: DriveGroupState;
  readonly hits: DriveHits;
  readonly more: boolean;
  readonly fetchMore: (() => void) | null;
  readonly retry: () => void;
}

function useDriveGroup(query: string): DriveGroup {
  const live = useSyncStatus().status === 'live';
  const searchable = useDriveRoots().length > 0 && driveWordsOf(query).length > 0;
  const pages = useDriveSearch(driveSearchOf(query), searchable && live);
  const items = flattenPages(pages.data, (page) => page.items);
  const state = driveGroupStateOf({
    searchable,
    live,
    answered: pages.data !== undefined,
    failed: pages.isError,
    found: items.length,
  });
  const more = pages.hasNextPage;
  const fetchMore = (): void => {
    background(pages.fetchNextPage(), 'search.drive_more_failed');
  };
  const retry = (): void => {
    background(pages.refetch(), 'search.drive_retry_failed');
  };
  return {
    state,
    hits: splitDriveHits(items),
    more,
    fetchMore: more && !pages.isFetchingNextPage ? fetchMore : null,
    retry,
  };
}

function GroupBody(props: DriveGroup & DriveResultsProps & { readonly open: Open }): ReactNode {
  switch (props.state) {
    case 'offline':
      return <GroupNote text="Photos and files show when the hub is reachable." />;
    case 'failed':
      return <GroupNote text="Photos and files could not be searched." onRetry={props.retry} />;
    case 'looking':
      return <Looking />;
    case 'found':
      return <Found key={props.query} {...props} />;
    case 'hidden':
    case 'empty':
      return null;
  }
}

export function DriveResults(props: DriveResultsProps): ReactNode {
  const group = useDriveGroup(props.query);
  const open = useOpen(props.query, props.onDone);
  const saver = useSaveSmartFolder();
  const rule = driveSmartRuleOf(props.query);
  if (group.state === 'hidden' || group.state === 'empty') {
    return saver.host;
  }
  const found = group.hits.photos.length + group.hits.files.length;
  return (
    <View>
      <Section
        title={DRIVE_GROUP_LABEL}
        className={props.look === 'page' ? 'pt-section-gap pb-1' : 'pt-3 pb-1'}
        {...(group.state === 'found' ? { caption: driveFoundText(found, group.more) } : {})}
        action={
          group.state === 'found' && rule !== null ? (
            <SectionAction
              label="Save as smart folder"
              onPress={() => {
                saver.open({
                  rule,
                  title: props.query.trim(),
                  matches: null,
                  from: `Search for “${props.query.trim()}”`,
                });
              }}
            />
          ) : null
        }
      >
        {null}
      </Section>
      <GroupBody {...group} {...props} open={open} />
      {saver.host}
    </View>
  );
}
