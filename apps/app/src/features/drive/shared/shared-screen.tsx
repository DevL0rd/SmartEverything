import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { useSectionParam } from '../../../components/use-section-param';
import { atLeast, useAreaWidth, useSizeClass } from '../../../design/size-class';
import { useIsOwner } from '../../../store/selectors';
import { useMinute } from '../../../store/clock';
import { flattenPages, useDriveAlbums, useDriveRoots, useDriveShares } from '../../nas/data';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { DriveFrame } from '../components/drive-frame';
import { HomeList } from './home-list';
import { LinksTable } from './links-table';
import type { ShareOpener } from './share-target';
import {
  homeScopedOf,
  homeSubtitleOf,
  linkDensityOf,
  linkGroupsOf,
  linksSubtitleOf,
  sharedViewOf,
  type SharedView,
} from './shared-model';

export interface SharedScreenProps {
  readonly openShare?: ShareOpener;
}

const VIEW_OPTIONS: readonly SegmentedOption<SharedView>[] = [
  { value: 'home', label: 'Shared with home' },
  { value: 'links', label: 'Links' },
];

function useLinksSubtitle(): string | undefined {
  const data = useDriveShares(null).data;
  const now = useMinute();
  if (data === undefined) return undefined;
  return linksSubtitleOf(
    linkGroupsOf(
      flattenPages(data, (page) => page.items),
      now,
    ),
  );
}

function primaryOf(openShare: ShareOpener | undefined): PrimaryActionProps | undefined {
  if (openShare === undefined) return undefined;
  return {
    label: 'New link',
    icon: 'link',
    onPress: (): void => {
      openShare({ kind: 'pick' });
    },
  };
}

export function SharedScreen({ openShare }: SharedScreenProps): ReactNode {
  const [param, setParam] = useSectionParam('view');
  const view = sharedViewOf(param);
  const owner = useIsOwner();
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const wide = atLeast(useSizeClass().width, 'large');
  const roots = homeScopedOf(useDriveRoots());
  const albums = homeScopedOf([...useDriveAlbums('drive'), ...useDriveAlbums('photos')]);
  const linksSubtitle = useLinksSubtitle();
  const subtitle = view === 'home' ? homeSubtitleOf(roots.length, albums.length) : linksSubtitle;
  const primary = primaryOf(openShare);
  return (
    <DriveFrame
      section="shared"
      title="Shared"
      scroll={view === 'home'}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(primary === undefined ? {} : { primary })}
    >
      <View className={view === 'home' ? 'gap-4' : 'flex-1 gap-4'}>
        <Segmented
          options={VIEW_OPTIONS}
          value={view}
          onChange={setParam}
          label="Shared view"
          fill={compact}
        />
        {view === 'home' ? (
          <HomeList roots={roots} albums={albums} openShare={openShare} compact={compact} />
        ) : (
          <View className="min-h-0 flex-1">
            <LinksTable
              owner={owner}
              density={linkDensityOf(compact, wide)}
              openShare={openShare}
            />
          </View>
        )}
      </View>
    </DriveFrame>
  );
}
