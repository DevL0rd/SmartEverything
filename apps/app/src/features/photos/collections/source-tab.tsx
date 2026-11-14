import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { PhotoSource } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { FlatChoice } from '../../../components/flat-choice';
import {
  beginSelecting,
  NO_SELECTION,
  toggleDay,
  toggleItem,
  type MediaSelection,
} from '../../../components/media-grid/selection';
import type { HeaderAction } from '../../../components/page-header';
import { useEscape } from '../../../components/use-escape';
import { count } from '../../../format/number';
import { useDayKey } from '../../../store/clock';
import type { SourceSearch } from '../../../api/photos';
import { useSyncStatus } from '../../../store/selectors';
import { ChipRow } from '../../../components/library-frame';
import { LibraryShell, type LibraryHeadProps } from '../library/library-head';
import { LibraryLoading } from '../library/library-states';
import { loadedLineOf } from '../library/library-tabs-view';
import { ResultLine } from '../library/result-line';
import { useClearOnChange } from '../library/use-clear-on-change';
import { removeLastOf } from '../search/library-search';
import { isSearching } from '../search/query';
import { NoResults } from '../search/no-results';
import { SOURCE_COPY, SOURCES_OFFLINE_BODY, SOURCES_OFFLINE_TITLE } from './source-copy';
import { SourceNote } from './source-note';
import { useSourceActions, type SourceActions } from './source-actions';
import { SourceGrid } from './source-grid';
import { nounCount, pickedTiles, type SourceTile } from './source-model';
import { SourceSelection } from './source-selection';
import { useSource, type SourceChipView, type SourceView } from './use-source';

type Update = (update: (selection: MediaSelection) => MediaSelection) => void;

function openTile(source: PhotoSource, tile: SourceTile): void {
  router.push(
    source === 'cameras' ? href.clip(tile.chipId, tile.id) : href.assistantChatFiles(tile.chipId),
  );
}

function EmptySource({ source }: { readonly source: PhotoSource }): ReactNode {
  const copy = SOURCE_COPY[source];
  return (
    <View className="items-center pt-6">
      <EmptyState
        icon={source === 'cameras' ? 'camera' : 'sparkles'}
        title={copy.emptyTitle}
        body={copy.emptyBody}
        action={
          source === 'cameras' ? (
            <Button label="Open Cameras" variant="tonal" href={href.cameras()} />
          ) : (
            <Button label="Open the assistant" variant="tonal" href={href.assistantChat()} />
          )
        }
      />
    </View>
  );
}

function CameraChips({
  chips,
  chipId,
  onChip,
}: {
  readonly chips: readonly SourceChipView[];
  readonly chipId: string | null;
  readonly onChip: (chipId: string | null) => void;
}): ReactNode {
  const total = chips.reduce((sum, chip) => sum + chip.count, 0);
  return (
    <View className="border-b border-outline-variant">
      <ChipRow label="Cameras">
        <FlatChoice
          label="All cameras"
          count={total}
          role="radio"
          active={chipId === null}
          onPress={() => {
            onChip(null);
          }}
        />
        {chips.map((chip) => (
          <FlatChoice
            key={chip.id}
            label={chip.name}
            count={chip.count}
            role="radio"
            active={chip.id === chipId}
            onPress={() => {
              onChip(chip.id);
            }}
          />
        ))}
      </ChipRow>
    </View>
  );
}

interface BodyProps {
  readonly source: PhotoSource;
  readonly view: SourceView;
  readonly selection: MediaSelection;
  readonly setSelection: Update;
  readonly header: ReactNode;
  readonly head: LibraryHeadProps;
}

function SourceEmpty({ source, head }: Pick<BodyProps, 'source' | 'head'>): ReactNode {
  const { search } = head;
  if (!isSearching(search.input)) return <EmptySource source={source} />;
  return <NoResults search={search.input} onRemoveLast={removeLastOf(search)} />;
}

function Body({ source, view, selection, setSelection, header, head }: BodyProps): ReactNode {
  const today = useDayKey();
  if (view.status === 'error') return <ErrorState error={view.error} retry={view.retry} page />;
  if (view.status === 'loading') return <LibraryLoading />;
  if (view.tiles.length === 0) return <SourceEmpty source={source} head={head} />;
  return (
    <SourceGrid
      source={source}
      days={view.days}
      names={view.names}
      today={today}
      selection={selection}
      onPress={(tile) => {
        if (selection.active) setSelection((current) => toggleItem(current, tile.id));
        else openTile(source, tile);
      }}
      onLongPress={(tile) => {
        setSelection((current) => toggleItem(current, tile.id));
      }}
      onSelectDay={(ids) => {
        setSelection((current) => toggleDay(current, ids));
      }}
      onEnd={view.more}
      header={<View>{header}</View>}
      footer={view.failedMore ? <ErrorState error={view.error} retry={view.retry} /> : <View />}
    />
  );
}

function subtitleOf(
  source: PhotoSource,
  total: number | undefined,
  cameras: number,
): string | null {
  if (total === undefined || total === 0) return null;
  const line = nounCount(source, total);
  if (source === 'ai' || cameras === 0) return line;
  const from = cameras === 1 ? '1 home camera' : `${count(cameras)} home cameras`;
  return `${line} from ${from}`;
}

function selectAction(view: SourceView, start: () => void): readonly HeaderAction[] {
  return view.tiles.length === 0
    ? []
    : [{ icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: start }];
}

interface BarInput {
  readonly source: PhotoSource;
  readonly view: SourceView;
  readonly selection: MediaSelection;
  readonly actions: SourceActions;
  readonly live: boolean;
  readonly clear: () => void;
}

function selectionBar({
  source,
  view,
  selection,
  actions,
  live,
  clear,
}: BarInput): ReactElement | null {
  if (!selection.active) return null;
  const picked = pickedTiles(view.tiles, selection.ids);
  return (
    <SourceSelection
      source={source}
      picked={picked}
      disabled={!live || actions.busy}
      chatHint={actions.chatHint}
      onClear={clear}
      onKeep={() => {
        actions.keep(picked);
      }}
      onChat={() => {
        actions.toChat(picked);
      }}
    />
  );
}

function OfflineBanner(): ReactNode {
  return (
    <Banner tone="warning" title={SOURCES_OFFLINE_TITLE} body={SOURCES_OFFLINE_BODY} wrapBody />
  );
}

function SourceTop({
  source,
  view,
  chipId,
  head,
  onChip,
}: {
  readonly source: PhotoSource;
  readonly view: SourceView;
  readonly chipId: string | null;
  readonly head: LibraryHeadProps;
  readonly onChip: (chipId: string | null) => void;
}): ReactNode {
  const { search } = head;
  return (
    <View className="gap-3 pb-1">
      {isSearching(search.input) ? (
        <View className="-mx-gutter">
          <ResultLine
            text={loadedLineOf(view.tiles.length, view.total !== undefined)}
            search={null}
            onClear={() => {
              search.act({ type: 'clear' });
            }}
          />
        </View>
      ) : null}
      <SourceNote source={source} />
      {source === 'cameras' && view.chips.length > 0 ? (
        <CameraChips chips={view.chips} chipId={chipId} onChip={onChip} />
      ) : null}
    </View>
  );
}

export interface SourceTabProps {
  readonly head: LibraryHeadProps;
  readonly source: PhotoSource;
  readonly search: SourceSearch;
}

export function SourceTab({ head, source, search }: SourceTabProps): ReactNode {
  const [chipId, setChipId] = useState<string | null>(null);
  const [selection, setSelection] = useState<MediaSelection>(NO_SELECTION);
  const clear = (): void => {
    setSelection(NO_SELECTION);
  };
  const view = useSource(source, chipId, search);
  const actions = useSourceActions(source, clear);
  const live = useSyncStatus().status === 'live';
  useEscape(selection.active, clear);
  useClearOnChange(JSON.stringify(search), clear);
  const start = (): void => {
    setSelection(beginSelecting);
  };
  return (
    <LibraryShell
      head={head}
      frame={{
        subtitle: subtitleOf(source, view.total, view.chips.length),
        actions: selection.active ? [] : selectAction(view, start),
        selection: selectionBar({ source, view, selection, actions, live, clear }),
        banner: live ? null : <OfflineBanner />,
      }}
    >
      <Body
        source={source}
        view={view}
        selection={selection}
        setSelection={setSelection}
        head={head}
        header={
          <SourceTop
            source={source}
            view={view}
            chipId={chipId}
            head={head}
            onChip={(next) => {
              clear();
              setChipId(next);
            }}
          />
        }
      />
    </LibraryShell>
  );
}
