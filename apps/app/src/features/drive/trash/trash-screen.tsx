import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { SelectionBar, type SelectionAction } from '../../../components/files/selection-bar';
import { useEscape } from '../../../components/use-escape';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { VirtualList } from '../../../components/virtual-list';
import { useAreaWidth } from '../../../design/size-class';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { DriveFrame } from '../components/drive-frame';
import { deleterKey, UNKNOWN_TONE, type PersonTone } from './deleted-by';
import {
  keptPicks,
  NOTHING_PICKED,
  pickedOf,
  pickStateOf,
  toggleAll,
  togglePicked,
  type TrashSelection,
} from './selection';
import { useTrashActions, type TrashActions } from './trash-actions';
import { filterTrash, NO_FILTER, type TrashFilter } from './trash-filter';
import { TrashFilterRow, TrashNoMatch } from './trash-filter-row';
import { subtitleOf } from './trash-copy';
import { wasInOf, type TrashItem } from './trash-model';
import { tableSnap, trashLayoutOf, type TrashLayout } from './trash-layout';
import { TrashRow } from './trash-row';
import { OfflineBanner, TrashEmpty, TrashNote } from './trash-states';
import { TableTop } from './trash-table';
import { useTrash, type TrashView } from './use-trash';

const log = new Logger('app.drive');

interface Body {
  readonly view: TrashView;
  readonly shown: readonly TrashItem[];
  readonly filter: TrashFilter;
  readonly setFilter: (filter: TrashFilter) => void;
  readonly owner: boolean;
  readonly layout: TrashLayout;
  readonly disabled: boolean;
  readonly picks: TrashSelection;
  readonly setPicks: (update: (picks: TrashSelection) => TrashSelection) => void;
  readonly actions: TrashActions;
}

function renderRow(body: Body): (item: TrashItem) => ReactElement {
  const tones = new Map(body.view.deletedBy.map((share) => [share.key, share.tone]));
  const toneOf = (item: TrashItem): PersonTone =>
    tones.get(deleterKey(item.deleter)) ?? UNKNOWN_TONE;
  return function RenderedRow(item: TrashItem): ReactElement {
    return (
      <TrashRow
        item={item}
        wasIn={wasInOf(item, body.view.rootLabelOf(item.rootId))}
        tone={toneOf(item)}
        layout={body.layout}
        picked={body.picks.has(item.id)}
        disabled={body.disabled}
        onToggle={(picked) => {
          body.setPicks((picks) => togglePicked(picks, picked.id));
        }}
        onRestore={(picked) => {
          body.actions.restore([picked]);
        }}
      />
    );
  };
}

function header(body: Body): ReactElement | undefined {
  const { view, shown, owner, layout, disabled, actions } = body;
  if (view.status !== 'ready' || view.items.length === 0) return undefined;
  return (
    <TableTop
      layout={layout}
      shares={view.deletedBy}
      months={view.months}
      pickState={pickStateOf(body.picks, shown)}
      onToggleAll={() => {
        body.setPicks((picks) => toggleAll(picks, shown));
      }}
      filterRow={
        <TrashFilterRow
          items={view.items}
          shown={shown.length}
          filter={body.filter}
          onFilter={body.setFilter}
          owner={owner}
          wide={layout !== 'compact'}
        />
      }
      deleteAll={
        owner
          ? {
              disabled: disabled || !view.complete,
              onPress: (): void => {
                actions.deleteAll(view.items);
              },
            }
          : null
      }
    />
  );
}

function selectionActions(body: Body, picked: readonly TrashItem[]): readonly SelectionAction[] {
  const restore: SelectionAction = {
    label: 'Restore',
    icon: 'archiveRestore',
    variant: 'tonal',
    disabled: body.disabled,
    onPress: () => {
      body.actions.restore(picked);
    },
  };
  if (!body.owner) return [restore];
  return [
    restore,
    {
      label: 'Delete now',
      icon: 'trash',
      variant: 'destructive',
      disabled: body.disabled,
      onPress: (): void => {
        body.actions.deleteNow(picked);
      },
    },
  ];
}

function PickedBar({
  body,
  onClear,
}: {
  readonly body: Body;
  readonly onClear: () => void;
}): ReactNode {
  const picked = pickedOf(body.shown, body.picks);
  if (picked.length === 0) return null;
  return (
    <SelectionBar
      docked
      summary={{
        kind: 'count',
        count: picked.length,
        total: body.shown.length,
        onClear,
        onSelectAll: () => {
          body.setPicks((picks) => toggleAll(picks, body.shown));
        },
      }}
      actions={selectionActions(body, picked)}
    />
  );
}

function useTrashLog(view: TrashView): void {
  useLifecycleLog(log, 'drive_trash_screen');
  const shown = view.items.length;
  useEffect(() => {
    log.debug('drive_trash.shown', { items: shown });
  }, [shown]);
}

interface TrashBody {
  readonly body: Body;
  readonly live: boolean;
  readonly clear: () => void;
}

function useTrashBody(layout: TrashLayout): TrashBody {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const view = useTrash();
  const [filter, setFilter] = useState<TrashFilter>(NO_FILTER);
  const shown = filterTrash(view.items, filter);
  const [selection, setPicks] = useState<TrashSelection>(NOTHING_PICKED);
  const picks = keptPicks(selection, shown);
  const clear = (): void => {
    setPicks(NOTHING_PICKED);
  };
  const actions = useTrashActions(clear, view.rootLabelOf);
  const disabled = !live || actions.busy;
  useEscape(picks.size > 0, clear);
  useTrashLog(view);
  return {
    body: { view, shown, filter, setFilter, owner, layout, disabled, picks, setPicks, actions },
    live,
    clear,
  };
}

function TrashList({ body }: { readonly body: Body }): ReactNode {
  const { view, shown, owner } = body;
  const top = header(body);
  return (
    <VirtualList
      sections={shown.length === 0 ? [] : [{ key: 'trash', title: null, data: shown }]}
      keyOf={(item) => item.id}
      renderItem={renderRow(body)}
      {...(top === undefined ? {} : { header: top })}
      empty={
        view.items.length === 0 ? (
          <TrashEmpty view={view} owner={owner} />
        ) : (
          <TrashNoMatch onClear={body.setFilter} />
        )
      }
      {...(shown.length === 0 ? {} : { footer: <TrashNote owner={owner} /> })}
      probe="drive-trash"
    />
  );
}

export function TrashScreen(): ReactNode {
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const { width, onLayout } = useMeasuredWidth(tableSnap);
  const { body, live, clear } = useTrashBody(trashLayoutOf(compact, width));
  const { view } = body;
  return (
    <DriveFrame
      section="trash"
      title="Trash"
      subtitle={subtitleOf(view.status === 'ready' ? view.totals : null, compact)}
      scroll={false}
      {...(live ? {} : { banner: <OfflineBanner /> })}
    >
      <View className="-mx-gutter flex-1" onLayout={onLayout}>
        <TrashList body={body} />
        <PickedBar body={body} onClear={clear} />
      </View>
    </DriveFrame>
  );
}
