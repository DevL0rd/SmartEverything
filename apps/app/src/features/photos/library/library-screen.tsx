import { useState, type ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { PhotoSource } from '@smarteverything/domain';
import { NO_SOURCE_SEARCH } from '../../../api/photos';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
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
import { tabParamOf, type TabCountInput } from '../model/library-tabs';
import { useLibrarySearch } from '../search/library-search';
import { DeviceTab } from './device-tab';
import { HubTab } from './hub-tab';
import type { LibraryHeadProps } from './library-head';
import { libraryLine } from './library-model';
import { activeTabOf, hubTabOf, shownTabs, tabChipsOf } from './library-tabs-view';
import { deviceCountOf } from './local-scope';

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
  return buckets === undefined ? null : libraryLine(buckets, size, year);
}

function openTab(id: Parameters<typeof tabParamOf>[0]): void {
  const tab = tabParamOf(id);
  router.setParams({ tab: tab ?? undefined });
}

function LibraryPage({
  q,
  tabParam,
}: {
  readonly q: string;
  readonly tabParam: unknown;
}): ReactNode {
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const pref = usePref(PREFS.photos);
  const prefs = pref.status === 'ready' ? pref.value : PREFS.photos.defaultValue;
  const tabs = shownTabs(localMediaSource() !== null, prefs);
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
    zoom: query.kind === 'source' ? null : zoom,
  };
  const subtitle = useLibrarySubtitle();
  if (query.kind === 'source') {
    return <SourceTab key={query.source} head={head} source={query.source} search={query.search} />;
  }
  if (query.kind === 'device') {
    return (
      <DeviceTab head={head} search={query.search} zoom={zoom} grouping={prefs.libraryGroup} />
    );
  }
  return (
    <HubTab
      head={head}
      tab={hubTabOf(tab.id)}
      scope={query.scope}
      zoom={zoom}
      grouping={prefs.libraryGroup}
      subtitle={subtitle}
    />
  );
}

export function LibraryScreen(): ReactNode {
  const params = useLocalSearchParams<{ tab?: string; q?: string }>();
  const q = params.q ?? '';
  return <LibraryPage key={q} q={q} tabParam={params.tab} />;
}
