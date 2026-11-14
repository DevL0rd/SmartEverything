import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { FlatChoice } from '../../../components/flat-choice';
import { ChipRow } from '../../../components/library-frame';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import type { HeaderAction } from '../../../components/page-header';
import { Segmented } from '../../../components/segmented';
import { PhotosFrame } from '../components/photos-frame';
import type { LibraryTabId } from '../model/library-tabs';
import { LibrarySearchBar, LibrarySearchPanel, type LibrarySearch } from '../search/library-search';
import type { SearchToken } from '../search/tokens';
import { BackupChip } from './backup-chip';
import { ZOOM_OPTIONS } from './library-model';
import type { TabChipView } from './library-tabs-view';

export interface ZoomControl {
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
}

export interface LibraryHeadProps {
  readonly search: LibrarySearch;
  readonly unused: readonly SearchToken[];
  readonly chips: readonly TabChipView[];
  readonly active: LibraryTabId;
  readonly onTab: (id: LibraryTabId) => void;
  readonly compact: boolean;
  readonly zoom: ZoomControl | null;
}

export interface ShellFrame {
  readonly subtitle: string | null;
  readonly actions: readonly HeaderAction[];
  readonly selection: ReactElement | null;
  readonly banner: ReactNode;
}

function TabsRow({
  chips,
  active,
  onTab,
  compact,
}: Pick<LibraryHeadProps, 'chips' | 'active' | 'onTab' | 'compact'>): ReactNode {
  return (
    <View className="border-b border-outline-variant">
      <ChipRow label="Library tabs">
        {chips.map((chip) => (
          <FlatChoice
            key={chip.id}
            label={chip.label}
            icon={chip.icon}
            count={chip.count ?? undefined}
            role="tab"
            active={chip.id === active}
            onPress={() => {
              onTab(chip.id);
            }}
          />
        ))}
        {compact ? <BackupChip /> : null}
      </ChipRow>
    </View>
  );
}

function Toolbar({ zoom }: { readonly zoom: ZoomControl | null }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-2">
      <BackupChip />
      {zoom === null ? null : (
        <Segmented
          options={ZOOM_OPTIONS}
          value={zoom.step}
          onChange={zoom.onStep}
          label="Zoom"
          compact
        />
      )}
    </View>
  );
}

export function LibraryHead(props: LibraryHeadProps): ReactNode {
  const { search, compact } = props;
  return (
    <View className="gap-2 pb-2">
      <View className={compact ? 'gap-2' : 'flex-row flex-wrap items-start gap-3'}>
        <View className="min-w-0 flex-1">
          <LibrarySearchBar search={search} unused={props.unused} />
        </View>
        {compact || search.open ? null : <Toolbar zoom={props.zoom} />}
      </View>
      {search.open ? null : (
        <TabsRow chips={props.chips} active={props.active} onTab={props.onTab} compact={compact} />
      )}
    </View>
  );
}

export function LibraryShell({
  head,
  frame,
  children,
}: {
  readonly head: LibraryHeadProps;
  readonly frame: ShellFrame;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <PhotosFrame
      active="library"
      search={false}
      scroll={false}
      {...(frame.subtitle === null ? {} : { subtitle: frame.subtitle })}
      actions={frame.actions}
      selection={frame.selection}
      {...(frame.banner === null ? {} : { banner: frame.banner })}
    >
      <LibraryHead {...head} />
      {head.search.open ? <LibrarySearchPanel search={head.search} /> : children}
    </PhotosFrame>
  );
}
