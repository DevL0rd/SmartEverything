import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { FlatChoice } from '../../../components/flat-choice';
import { ChoiceChip } from '../../../components/choice-chip';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { HScroller, type RevealRange } from '../../../components/h-scroller';
import { PhotosFrame } from '../components/photos-frame';
import { ShowAllRow, ShowAllToggle } from '../folders/show-all-toggle';
import type { LibraryTabId } from '../model/library-tabs';
import { UnusedNote, librarySearchConfigOf, type LibrarySearch } from '../search/library-search';
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
  readonly actions: readonly ShellAction[];
  readonly selection: ReactElement | null;
  readonly banner: ReactNode;
  readonly footer?: ReactNode;
}

function TabChips({
  chips,
  active,
  onTab,
  onActiveLayout,
}: Pick<LibraryHeadProps, 'chips' | 'active' | 'onTab'> & {
  readonly onActiveLayout: (range: RevealRange) => void;
}): ReactNode {
  return chips.map((chip) => (
    <View
      key={chip.id}
      onLayout={(event) => {
        const { x, width } = event.nativeEvent.layout;
        if (chip.id === active) onActiveLayout({ x, width });
      }}
    >
      <FlatChoice
        label={chip.label}
        icon={chip.icon}
        count={chip.count ?? undefined}
        role="tab"
        active={chip.id === active}
        onPress={() => {
          onTab(chip.id);
        }}
      />
    </View>
  ));
}

function useActiveReveal(
  active: LibraryTabId,
): readonly [RevealRange | null, (range: RevealRange) => void] {
  const [held, setHeld] = useState<{
    readonly tab: LibraryTabId;
    readonly range: RevealRange;
  } | null>(null);
  const range = held?.tab === active ? held.range : null;
  return [
    range,
    (next): void => {
      if (range?.x === next.x && range.width === next.width) return;
      setHeld({ tab: active, range: next });
    },
  ];
}

function TabsRow({
  chips,
  active,
  onTab,
  compact,
}: Pick<LibraryHeadProps, 'chips' | 'active' | 'onTab' | 'compact'>): ReactNode {
  const [reveal, onActiveLayout] = useActiveReveal(active);
  const tabs = (
    <TabChips chips={chips} active={active} onTab={onTab} onActiveLayout={onActiveLayout} />
  );
  return (
    <View className="min-w-0 flex-1">
      <HScroller label="Library tabs" fade reveal={reveal}>
        <View className="flex-row items-center gap-2">
          {tabs}
          {compact ? <BackupChip /> : null}
        </View>
      </HScroller>
    </View>
  );
}

function Toolbar({ zoom }: { readonly zoom: ZoomControl | null }): ReactNode {
  return (
    <View className="shrink-0 flex-row items-center gap-2">
      <ShowAllToggle />
      <BackupChip />
      {zoom === null ? null : (
        <ChoiceChip
          label="Zoom"
          icon="grid"
          options={ZOOM_OPTIONS}
          value={zoom.step}
          all={zoom.step}
          onChange={zoom.onStep}
        />
      )}
    </View>
  );
}

export function LibraryBar(props: LibraryHeadProps): ReactNode {
  const { compact } = props;
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <TabsRow chips={props.chips} active={props.active} onTab={props.onTab} compact={compact} />
        {compact ? null : <Toolbar zoom={props.zoom} />}
      </View>
      {compact ? <ShowAllRow /> : null}
      <UnusedNote unused={props.unused} />
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
  const open = head.search.open;
  return (
    <PhotosFrame
      active="library"
      scroll={false}
      search={librarySearchConfigOf(head.search, head.unused)}
      {...(open ? {} : { toolbar: <LibraryBar {...head} /> })}
      {...(frame.subtitle === null ? {} : { subtitle: frame.subtitle })}
      actions={frame.actions}
      selection={frame.selection}
      {...(frame.banner === null ? {} : { banner: frame.banner })}
      {...(frame.footer === undefined ? {} : { footer: frame.footer })}
    >
      {children}
    </PhotosFrame>
  );
}
