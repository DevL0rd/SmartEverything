import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Engine } from '@smarteverything/domain';
import { KeyboardList } from '../../../../components/keyboard-list';
import { ListRow } from '../../../../components/list-row';
import { SearchField } from '../../../../components/search-field';
import { modifierLabel, useIdiom } from '../../../../design/platform';
import { useEngineAccessory } from '../../chats/engine-accessories';
import { useEngineEfforts } from '../../chats/engine-efforts';
import { branchesOnPick } from '../../chats/chat-engine-change';
import { useFavouriteModels } from '../../data/favourites';
import { SourceStatuses } from '../model-source-status';
import { MachineRow } from './machine-panel';
import { PanelHead, PanelNote, ShortcutHint } from './panel-chrome';
import { panelEscapeOf } from './panel-escape';
import { usePanelData, type PanelData } from './panel-data';
import { keyboardItems, libraryMoreTitle, rowEntries } from './panel-items';
import { PanelList } from './panel-list';
import { PanelProblem } from './panel-states';
import type { ModelPanelState } from './panel-state';
import { useRecentModels } from './panel-recent';
import { ThinkingRow } from './thinking-panel';
import type { PanelPicker } from './use-panel-picker';

export interface MainPageProps {
  readonly state: ModelPanelState;
  readonly pick: PanelPicker;
  readonly engine: Engine;
  readonly onClose: () => void;
  readonly onLibrary: (query: string) => void;
}

function SearchBox({ state }: { readonly state: ModelPanelState }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View className="px-4 pb-2">
      <SearchField
        value={state.text}
        onChange={state.setText}
        placeholder="Search models"
        variant="field"
        focusOnMount={pointer}
      />
    </View>
  );
}

function Notes({ state, pick }: Pick<MainPageProps, 'state' | 'pick'>): ReactNode {
  return (
    <>
      {pick.reason === null ? null : (
        <PanelNote
          icon={pick.reason.icon}
          text={pick.reason.text}
          {...(pick.stop === null ? {} : { action: { label: 'Stop', onPress: pick.stop } })}
        />
      )}
      {state.note === null ? null : <PanelNote icon="refresh" text={state.note} />}
    </>
  );
}

function LibraryFooter({
  total,
  onOpen,
}: {
  readonly total: number | null;
  readonly onOpen: () => void;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <ListRow
      title="Model library"
      icon="layers"
      chevron
      {...(total === null ? {} : { value: `${String(total)} models` })}
      {...(pointer ? { trailing: <ShortcutHint keys={`${modifierLabel()} L`} /> } : {})}
      onPress={onOpen}
    />
  );
}

function ListFooter({
  data,
  query,
  onLibrary,
}: {
  readonly data: PanelData;
  readonly query: string;
  readonly onLibrary: (query: string) => void;
}): ReactNode {
  const more = libraryMoreTitle({
    total: data.total,
    shown: rowEntries(data.entries).length,
    searching: query !== '',
  });
  return (
    <>
      <SourceStatuses sources={[data.search.sources.native, data.search.sources.routes]} />
      {more === null ? null : (
        <ListRow
          title={more}
          chevron
          onPress={(): void => {
            onLibrary(query);
          }}
        />
      )}
    </>
  );
}

function useFavourite(): ((id: string) => void) | null {
  const favourites = useFavouriteModels();
  return favourites.status === 'ready' ? favourites.toggle : null;
}

function Header({
  state,
  pick,
  engine,
  onClose,
}: Pick<MainPageProps, 'state' | 'pick' | 'engine' | 'onClose'>): ReactNode {
  return (
    <>
      <PanelHead title="Model and thinking" onBack={null} onClose={onClose} />
      <Notes state={state} pick={pick} />
      <MachineRow
        engine={engine}
        onOpen={(): void => {
          state.setPage('machine');
        }}
      />
      <ThinkingRow
        engine={engine}
        blocked={!pick.editable}
        onChange={pick.change}
        onOpen={(): void => {
          state.setPage('thinking');
        }}
      />
      <SearchBox state={state} />
    </>
  );
}

function Body({
  state,
  data,
  onLibrary,
}: Pick<MainPageProps, 'state' | 'onLibrary'> & { readonly data: PanelData }): ReactNode {
  const query = state.text.trim();
  const chatEngine = useEngineAccessory()?.chat?.engine;
  const onFavourite = useFavourite();
  if (data.view !== 'ready') {
    return (
      <PanelProblem
        view={data.view}
        query={query}
        retry={data.retry}
        onLibrary={(): void => {
          onLibrary(query);
        }}
      />
    );
  }
  return (
    <PanelList
      key={query === '' ? 'idle' : data.search.key}
      entries={data.entries}
      branchesOn={(key): boolean => chatEngine !== undefined && branchesOnPick(chatEngine, key)}
      onFavourite={onFavourite}
      memory={state.scroll}
      footer={<ListFooter data={data} query={query} onLibrary={onLibrary} />}
    />
  );
}

export function MainPage({ state, pick, engine, onClose, onLibrary }: MainPageProps): ReactNode {
  const query = state.text.trim();
  const recent = useRecentModels();
  const data = usePanelData({ picker: pick.picker, text: state.text, recent: recent.ids, engine });
  const rows = rowEntries(data.entries);
  const hasThinking = useEngineEfforts(engine).length > 0;
  return (
    <KeyboardList
      items={keyboardItems({
        rows,
        blocked: !pick.editable,
        searching: query !== '',
        hasThinking,
      })}
      label="Models"
      autoHighlight={query !== ''}
      className="min-h-0 flex-1"
      {...(panelEscapeOf(state.page, state.text) === 'clear'
        ? {
            onEscape: (): void => {
              state.setText('');
            },
          }
        : {})}
      onActivate={(id): void => {
        if (id === 'machine' || id === 'thinking') state.setPage(id);
        else rows.find((row) => row.key === id)?.candidate.pick?.();
      }}
    >
      <Header state={state} pick={pick} engine={engine} onClose={onClose} />
      <View className="min-h-0 flex-1">
        <Body state={state} data={data} onLibrary={onLibrary} />
      </View>
      <LibraryFooter
        total={data.total}
        onOpen={(): void => {
          onLibrary(query);
        }}
      />
    </KeyboardList>
  );
}
