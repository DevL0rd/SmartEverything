import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { useSectionParam } from '../../../components/use-section-param';
import { useAreaWidth } from '../../../design/size-class';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { useMinute } from '../../../store/clock';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useSharedByMe, useSharedWithMe } from '../data';
import { DriveFrame } from '../components/drive-frame';
import { useShareSheet } from '../share';
import { ByMeList } from './by-me-list';
import {
  byMeLinksOf,
  byMeSubtitleOf,
  linkGroupsOf,
  sharedViewOf,
  withMeSubtitleOf,
  type SharedView,
} from './shared-model';
import { WithMeList } from './with-me-list';

const VIEW_OPTIONS: readonly SegmentedOption<SharedView>[] = [
  { value: 'with-me', label: 'With me' },
  { value: 'by-me', label: 'By me' },
];

export const OFFLINE_TITLE = 'Showing the last known shares · reconnecting';

function useSubtitle(view: SharedView): string | undefined {
  const withMe = useSharedWithMe().data;
  const byMe = useSharedByMe().data;
  const now = useMinute();
  if (view === 'with-me') {
    if (withMe === undefined) return undefined;
    return withMeSubtitleOf(flattenPages(withMe, (page) => page.items));
  }
  if (byMe === undefined) return undefined;
  const entries = flattenPages(byMe, (page) => page.items);
  return byMeSubtitleOf(entries.length, linkGroupsOf(byMeLinksOf(entries), now));
}

export function SharedScreen(): ReactNode {
  const [param, setParam] = useSectionParam('view');
  const view = sharedViewOf(param);
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const live = useSyncStatus().status === 'live';
  const subtitle = useSubtitle(view);
  const sheet = useShareSheet();
  return (
    <DriveFrame
      section="shared"
      title="Shared"
      scroll={false}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(live ? {} : { banner: <Banner tone="info" title={OFFLINE_TITLE} /> })}
    >
      <View className="flex-1 gap-4">
        <Segmented
          options={VIEW_OPTIONS}
          value={view}
          onChange={setParam}
          label="Shared view"
          fill={compact}
        />
        <View className="-mx-gutter min-h-0 flex-1">
          {view === 'with-me' ? (
            <WithMeList />
          ) : (
            <ByMeList
              onManage={(item) => {
                sheet.open({ item });
              }}
            />
          )}
        </View>
      </View>
      {sheet.host}
    </DriveFrame>
  );
}
