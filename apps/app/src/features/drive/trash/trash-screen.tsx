import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { SHELL_BREAKPOINTS } from '../../../components/page-shell/layout';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { VirtualList } from '../../../components/virtual-list';
import { useAreaWidth } from '../../../design/size-class';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { DriveFrame } from '../components/drive-frame';
import { SelectionRow, type FileBrowserHandle } from '../../files';
import { DriveListFrame, useDriveList } from '../source/drive-lists';
import type { DriveNode, DriveOrigin } from '../source/drive-node';
import { deleterKey, UNKNOWN_TONE } from './deleted-by';
import { pickStateOf } from './selection';
import { useTrashActions, type TrashActions } from './trash-actions';
import {
  filterTrash,
  isFiltered,
  NO_FILTER,
  shownText,
  type TrashDriveOf,
  type TrashFilter,
} from './trash-filter';
import { TrashFilterRow, TrashNoMatch } from './trash-filter-row';
import { deleteLabelOf, subtitleOf, type DeleteScope } from './trash-copy';
import { wasInOf, type TrashItem } from './trash-model';
import { summaryWideOf, trashLayoutOf, trashSnap, type TrashLayout } from './trash-layout';
import { TrashRow } from './trash-row';
import { OfflineBanner, TrashEmpty, TrashNote } from './trash-states';
import { DeleteAllButton, TableTop, type DeleteAll } from './trash-table';
import { useTrash, type TrashView } from './use-trash';

const log = new Logger('app.drive');

interface Body {
  readonly view: TrashView;
  readonly shown: readonly TrashItem[];
  readonly filter: TrashFilter;
  readonly setFilter: (filter: TrashFilter) => void;
  readonly owner: boolean;
  readonly driveOf: TrashDriveOf;
  readonly layout: TrashLayout;
  readonly wide: boolean;
  readonly disabled: boolean;
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly nodes: readonly DriveNode[];
  readonly actions: TrashActions;
}

function renderRow(body: Body): (node: DriveNode) => ReactElement {
  const tones = new Map(body.view.deletedBy.map((share) => [share.key, share.tone]));
  const items = new Map(body.shown.map((item) => [item.id, item]));
  return function RenderedRow(node: DriveNode): ReactElement {
    const item = items.get(node.key);
    if (item === undefined) throw new MissingTrashItemError(node.key);
    return (
      <TrashRow
        item={item}
        node={node}
        browser={body.browser}
        wasIn={wasInOf(item, body.view.rootLabelOf(item.rootId))}
        tone={tones.get(deleterKey(item.deleter)) ?? UNKNOWN_TONE}
        layout={body.layout}
      />
    );
  };
}

class MissingTrashItemError extends Error {
  override readonly name = 'MissingTrashItemError';
  constructor(key: string) {
    super(`The trash row ${key} has no trash item.`);
  }
}

function deleteAllOf(body: Body): DeleteAll | null {
  const { view, shown, filter, disabled, actions } = body;
  if (shown.length === 0) return null;
  if (!shown.every((item) => view.nodeOf.get(item.id)?.deletable === true)) return null;
  const scope: DeleteScope = isFiltered(filter) ? 'shown' : 'all';
  return {
    label: deleteLabelOf(scope, shown.length),
    disabled: disabled || !view.complete,
    onPress: (): void => {
      actions.deleteAll(shown, scope);
    },
  };
}

function header(body: Body): ReactElement | undefined {
  const { view, shown, driveOf, layout, browser } = body;
  if (view.status !== 'ready' || view.items.length === 0) return undefined;
  const deleteAll = deleteAllOf(body);
  const picking = browser.picked.length > 0;
  const trailing =
    layout === 'table' && deleteAll !== null && !picking ? (
      <DeleteAllButton deleteAll={deleteAll} />
    ) : null;
  return (
    <TableTop
      layout={layout}
      wide={body.wide}
      shares={view.deletedBy}
      months={view.months}
      pickState={pickStateOf(browser.picked.length, shown.length)}
      onToggleAll={() => {
        if (browser.picked.length >= shown.length) browser.commands.clearSelection();
        else browser.commands.selectAll();
      }}
      empty={shown.length === 0}
      selection={picking ? <SelectionRow browser={browser} /> : null}
      filterRow={
        <TrashFilterRow
          items={view.items}
          filter={body.filter}
          onFilter={body.setFilter}
          driveOf={driveOf}
          {...(trailing === null ? {} : { trailing })}
        />
      }
      deleteAll={layout === 'table' ? null : deleteAll}
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
}

function useTrashBody(layout: TrashLayout, wide: boolean): TrashBody {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const view = useTrash();
  const driveOf: TrashDriveOf = (item) => view.chipOf(item.rootId).key;
  const [filter, setFilter] = useState<TrashFilter>(NO_FILTER);
  const shown = filterTrash(view.items, filter, driveOf);
  const nodes = shown.flatMap((item) => {
    const node = view.nodeOf.get(item.id);
    return node === undefined ? [] : [node];
  });
  const browser = useDriveList('trash', 'trash', nodes);
  const actions = useTrashActions(browser.commands.clearSelection);
  const disabled = !live || actions.busy;
  useTrashLog(view);
  return {
    body: {
      view,
      shown,
      filter,
      setFilter,
      owner,
      driveOf,
      layout,
      wide,
      disabled,
      browser,
      nodes,
      actions,
    },
    live,
  };
}

function TrashList({ body }: { readonly body: Body }): ReactNode {
  const { view, shown, owner, nodes } = body;
  const top = header(body);
  return (
    <VirtualList
      sections={nodes.length === 0 ? [] : [{ key: 'trash', title: null, data: nodes }]}
      keyOf={(node) => node.key}
      renderItem={renderRow(body)}
      {...(top === undefined ? {} : { header: top })}
      empty={
        view.items.length === 0 ? (
          <TrashEmpty view={view} owner={owner} wide={body.wide} />
        ) : (
          <TrashNoMatch onClear={body.setFilter} />
        )
      }
      {...(shown.length === 0 ? {} : { footer: <TrashNote owner={owner} /> })}
      probe="drive-trash"
    />
  );
}

function trashSearchOf(body: Body): ShellSearchConfig | undefined {
  const { view, filter, shown, setFilter } = body;
  if (view.items.length === 0 && filter.query === '') return undefined;
  return {
    value: filter.query,
    onChange: (query: string): void => {
      setFilter({ ...filter, query });
    },
    placeholder: 'Find in trash',
    label: 'Find in trash',
    ...(isFiltered(filter) ? { status: shownText(shown.length, view.items.length) } : {}),
  };
}

export function TrashScreen(): ReactNode {
  const compact = useAreaWidth() < SHELL_BREAKPOINTS.compactMax;
  const { width, onLayout } = useMeasuredWidth(trashSnap);
  const layout = trashLayoutOf(compact, width);
  const { body, live } = useTrashBody(layout, summaryWideOf(layout, width));
  const { view } = body;
  const search = trashSearchOf(body);
  return (
    <DriveFrame
      section="trash"
      title="Trash"
      subtitle={subtitleOf(
        view.status === 'ready' ? view.totals : null,
        compact || search !== undefined,
      )}
      scroll={false}
      {...(live ? {} : { banner: <OfflineBanner /> })}
      {...(search === undefined ? {} : { search })}
    >
      <DriveListFrame browser={body.browser} inlineSelection>
        <View className="-mx-gutter flex-1" onLayout={onLayout}>
          <TrashList body={body} />
        </View>
      </DriveListFrame>
    </DriveFrame>
  );
}
