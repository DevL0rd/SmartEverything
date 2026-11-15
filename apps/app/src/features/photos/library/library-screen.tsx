import { useState, type ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { LibraryScope, PhotoSource } from '@smarteverything/domain';
import { NO_SOURCE_SEARCH } from '../../../api/photos';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import type { MediaGrouping } from '../../../components/media-grid/tiles';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { useAreaWidth } from '../../../design/size-class';
import { useDayKey } from '../../../store/clock';
import { PREFS, usePref } from '../../../store/prefs';
import { SourceTab } from '../collections/source-tab';
import {
  PHOTO_ALL,
  usePhotoBuckets,
  usePhotoInsights,
  usePhotoRailCounts,
  usePhotoSource,
} from '../data';
import { localMediaSource } from '../local/source';
import { useLocalLibrary } from '../local/use-local-library';
import { scopeOf } from '../model/library-scope';
import { PartnerTab, usePartnerTabs } from '../sharing';
import { tabParamOf, type LibraryTab, type TabCountInput } from '../model/library-tabs';
import { useLibrarySearch } from '../search/library-search';
import { DeviceTab } from './device-tab';
import { HubTab } from './hub-tab';
import type { LibraryHeadProps, ZoomControl } from './library-head';
import { libraryLine, showsZoomChip } from './library-model';
import { activeTabOf, hubTabOf, shownTabs, tabChipsOf } from './library-tabs-view';
import { deviceCountOf } from './local-scope';
import type { FeedFocus } from './use-library-feed';

function useSourceCount(source: PhotoSource): number | undefined {
  const chips = usePhotoSource(source, null, NO_SOURCE_SEARCH).data?.pages[0]?.chips;
  return chips?.reduce((sum, chip) => sum + chip.count, 0);
}

function useTabCounts(): TabCountInput {
  return {
    rail: usePhotoRailCounts().data,
    cameras: useSourceCount('cameras'),
    ai: useSourceCount('ai'),
    device: deviceCountOf(useLocalLibrary()),
  };
}

function useLibrarySubtitle(): string | null {
  const buckets = usePhotoBuckets(PHOTO_ALL).data;
  const size = usePhotoInsights('all_time').data?.bytes;
  const year = Number(useDayKey().slice(0, 4));
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  return buckets === undefined ? null : libraryLine(buckets, size, year, compact);
}

function openTab(id: Parameters<typeof tabParamOf>[0]): void {
  const tab = tabParamOf(id);
  router.setParams({ tab: tab ?? undefined });
}

function ScopedTab({
  tab,
  head,
  scope,
  zoom,
  grouping,
  focus,
}: {
  readonly tab: LibraryTab;
  readonly head: LibraryHeadProps;
  readonly scope: LibraryScope;
  readonly zoom: ZoomControl;
  readonly grouping: MediaGrouping;
  readonly focus: FeedFocus | null;
}): ReactNode {
  const subtitle = useLibrarySubtitle();
  if (tab.kind === 'partner') {
    return (
      <PartnerTab
        head={head}
        shareId={tab.shareId}
        name={tab.label}
        scope={scope}
        zoom={zoom}
        grouping={grouping}
      />
    );
  }
  return (
    <HubTab
      head={head}
      tab={hubTabOf(tab.id)}
      scope={scope}
      zoom={zoom}
      grouping={grouping}
      subtitle={subtitle}
      focus={focus}
    />
  );
}

function LibraryPage({
  q,
  tabParam,
  month,
}: {
  readonly q: string;
  readonly tabParam: unknown;
  readonly month: string | null;
}): ReactNode {
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const pref = usePref(PREFS.photos);
  const prefs = pref.status === 'ready' ? pref.value : PREFS.photos.defaultValue;
  const tabs = [...shownTabs(localMediaSource() !== null, prefs), ...usePartnerTabs()];
  const tab = activeTabOf(tabParam, tabs);
  const search = useLibrarySearch(q);
  const { state } = search;
  const { tokens, words } = state;
  const query = scopeOf(tab, { tokens, text: words });
  const [step, setStep] = useState<MediaZoomStep | null>(null);
  const zoom = { step: step ?? prefs.libraryZoom, onStep: setStep };
  const head: LibraryHeadProps = {
    search,
    unused: query.unused,
    chips: tabChipsOf(tabs, useTabCounts()),
    active: tab.id,
    onTab: openTab,
    compact,
    zoom: showsZoomChip(tab.id, query.kind === 'source') ? zoom : null,
  };
  if (query.kind === 'source') {
    return <SourceTab key={query.source} head={head} source={query.source} search={query.search} />;
  }
  if (query.kind === 'device') {
    return (
      <DeviceTab head={head} search={query.search} zoom={zoom} grouping={prefs.libraryGroup} />
    );
  }
  return (
    <ScopedTab
      tab={tab}
      head={head}
      scope={query.scope}
      zoom={zoom}
      grouping={prefs.libraryGroup}
      focus={month === null ? null : { month, onReached: clearMonth }}
    />
  );
}

function clearMonth(): void {
  router.setParams({ month: undefined });
}

export function monthParamOf(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

export function LibraryScreen(): ReactNode {
  const params = useLocalSearchParams<{ tab?: string; q?: string; month?: string }>();
  const q = params.q ?? '';
  return <LibraryPage key={q} q={q} tabParam={params.tab} month={monthParamOf(params.month)} />;
}
