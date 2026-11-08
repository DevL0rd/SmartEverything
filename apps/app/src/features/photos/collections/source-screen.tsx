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
import { useSyncStatus } from '../../../store/selectors';
import { ChipRow } from '../../nas/frame';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoRailCounts } from '../data';
import { TimelineLoading } from '../timeline/timeline-states';
import { SOURCE_COPY, SOURCES_OFFLINE_BODY, SOURCES_OFFLINE_TITLE } from './copy';
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
}

function Body({ source, view, selection, setSelection, header }: BodyProps): ReactNode {
  const today = useDayKey();
  if (view.status === 'error') return <ErrorState error={view.error} retry={view.retry} page />;
  if (view.status === 'loading') return <TimelineLoading />;
  if (view.tiles.length === 0) return <EmptySource source={source} />;
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
): Partial<{ readonly subtitle: string }> {
  if (total === undefined || total === 0) return {};
  const line = nounCount(source, total);
  if (source === 'ai' || cameras === 0) return { subtitle: line };
  const from = cameras === 1 ? '1 home camera' : `${count(cameras)} home cameras`;
  return { subtitle: `${line} from ${from}` };
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
  onChip,
}: {
  readonly source: PhotoSource;
  readonly view: SourceView;
  readonly chipId: string | null;
  readonly onChip: (chipId: string | null) => void;
}): ReactNode {
  return (
    <View className="gap-3 pb-1">
      <SourceNote source={source} />
      {source === 'cameras' && view.chips.length > 0 ? (
        <CameraChips chips={view.chips} chipId={chipId} onChip={onChip} />
      ) : null}
    </View>
  );
}

export function SourceScreen({ source }: { readonly source: PhotoSource }): ReactNode {
  const [chipId, setChipId] = useState<string | null>(null);
  const [selection, setSelection] = useState<MediaSelection>(NO_SELECTION);
  const clear = (): void => {
    setSelection(NO_SELECTION);
  };
  const view = useSource(source, chipId);
  const actions = useSourceActions(source, clear);
  const live = useSyncStatus().status === 'live';
  const total = usePhotoRailCounts().data?.[source];
  useEscape(selection.active, clear);
  const start = (): void => {
    setSelection(beginSelecting);
  };
  return (
    <PhotosFrame
      active={source}
      scroll={false}
      {...subtitleOf(source, total, view.chips.length)}
      actions={selection.active ? [] : selectAction(view, start)}
      selection={selectionBar({ source, view, selection, actions, live, clear })}
      {...(live ? {} : { banner: <OfflineBanner /> })}
    >
      <Body
        source={source}
        view={view}
        selection={selection}
        setSelection={setSelection}
        header={
          <SourceTop
            source={source}
            view={view}
            chipId={chipId}
            onChip={(next) => {
              clear();
              setChipId(next);
            }}
          />
        }
      />
    </PhotosFrame>
  );
}
