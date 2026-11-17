import type { PlannerItemRow } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { closeFlow } from '../../../app-shell/close-flow';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { twoFrameColumnsAt } from '../../../components/page-shell/layout';
import { PageShell } from '../../../components/page-shell/page-shell';
import { Skeleton } from '../../../components/skeleton';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { useHubOffline } from '../../clock';
import { useVisibleItem } from '../data/assignment';
import { usePlannerShownPerson } from '../frame/person';
import { ItemBody, type ItemFocus } from './item-body';
import { useItemEditor, type ItemTarget } from './item-editor';
import { useItemKeys, useItemMenuItems, type ItemActionScope } from './item-menu-host';

export interface ItemScreenProps {
  readonly itemId: string;
  readonly occurrenceKey: string | null;
}

const selectLoaded = (state: StoreState): boolean => state.loaded;

function leaveItem(item: PlannerItemRow): void {
  closeFlow(item.kind === 'event' ? href.planner.calendar() : href.planner.tasks());
}

function kindTitleOf(item: PlannerItemRow): string {
  if (item.parent_id !== null) return 'Step';
  return item.kind === 'event' ? 'Event' : 'Task';
}

interface OpenItemScreenProps {
  readonly item: PlannerItemRow;
  readonly target: ItemTarget;
  readonly onLeave: (item: PlannerItemRow) => void;
}

function useScreenScope(
  target: ItemTarget,
  offline: boolean,
  onLeave: (item: PlannerItemRow) => void,
  onFocus: (focus: ItemFocus) => void,
): ItemActionScope {
  return {
    person: target.person,
    offline,
    onOpen: (intent): void => {
      onFocus({ part: intent === 'attach' ? 'attach' : 'when', at: Date.now() });
    },
    onDeleted: (item): void => {
      onLeave(item);
      leaveItem(item);
    },
  };
}

function OpenItemScreen({ item, target, onLeave }: OpenItemScreenProps): ReactNode {
  const offline = useHubOffline();
  const pointer = useIdiom() === 'pointer';
  const columns = twoFrameColumnsAt(useSizeClass().area);
  const [focus, setFocus] = useState<ItemFocus | null>(null);
  const editor = useItemEditor(item, target, offline);
  const scope = useScreenScope(target, offline, onLeave, setFocus);
  const menu = useItemMenuItems(item, target, scope);
  useItemKeys(menu, pointer);
  return (
    <PageShell
      title={kindTitleOf(item)}
      overflow={menu.items}
      {...(editor.bar === null ? {} : { footer: editor.bar })}
    >
      <ItemBody
        item={item}
        editor={editor}
        target={target}
        scope={scope}
        focus={focus}
        inPanel={false}
        columns={columns}
        offline={offline}
        onClose={() => {
          leaveItem(item);
        }}
      />
    </PageShell>
  );
}

function LoadingItemScreen(): ReactNode {
  return (
    <PageShell title="Planner item">
      <View accessible accessibilityLabel="Loading the item" className="gap-4 pt-2">
        <Skeleton shape="line" className="h-10" />
        <Skeleton shape="text" className="w-48" />
        <Skeleton shape="tile" className="h-64" />
      </View>
    </PageShell>
  );
}

function GoneItemScreen(): ReactNode {
  return (
    <PageShell title="Planner item">
      <EmptyState
        icon="calendar"
        title="This item is gone"
        body="It was deleted, or it belongs to someone else."
        action={<Button label="Open Planner" variant="tonal" href={href.planner.index()} />}
      />
    </PageShell>
  );
}

export function ItemScreen({ itemId, occurrenceKey }: ItemScreenProps): ReactNode {
  const person = usePlannerShownPerson();
  const loaded = useStoreSelector(selectLoaded);
  const [leaving, setLeaving] = useState<PlannerItemRow | null>(null);
  const item = useVisibleItem(person, itemId) ?? leaving;
  if (item === null) return loaded ? <GoneItemScreen /> : <LoadingItemScreen />;
  return (
    <OpenItemScreen
      key={item.id}
      item={item}
      target={{ itemId, occurrenceKey, person }}
      onLeave={setLeaving}
    />
  );
}
