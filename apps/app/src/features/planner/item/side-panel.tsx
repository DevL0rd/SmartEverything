import type { PlannerItemRow, PlannerOccurrenceView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { Button } from '../../../components/button';
import { DockedPane } from '../../../components/docked-pane';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu } from '../../../components/menu';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { cn } from '../../../design/cn';
import { DURATION, EASING, entering, useMotion } from '../../../design/motion';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { useMyWatch } from '../../watches';
import { usePlannerPreferences, usePlannerRange, type PlannerPerson } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from './composer-tokens';
import { reminderSummaryOf } from './item-fields';
import {
  useFrameActionScope,
  useItemKeys,
  useItemMenuItems,
  type ItemMenuItems,
} from './item-menu-host';
import { useItemCollections, useVisibleItem } from '../data/assignment';
import { TaskRuleCard } from './completion-rule-picker';
import {
  ItemBody,
  ItemMeta,
  ItemStepsFor,
  useItemParent,
  useOwnerName,
  type ItemFocus,
} from './item-body';
import { ItemGuests } from './item-guests';
import { useItemEditor } from './item-editor';
import { RsvpBar } from './rsvp-bar';
import {
  dayBarOf,
  dayWindowOf,
  occurrenceIn,
  onWatchCalendar,
  panelDayOf,
  proposalNear,
} from './panel-model';
import { DayBarWell, FactRow, PanelAttachments, PlanAroundCard, whenLineOf } from './panel-parts';
import {
  PANEL_WIDTH,
  clearPlannerSelection,
  selectPlannerItem,
  setPanelWidth,
  usePanelWidth,
  usePlannerSelection,
  type PlannerSelection,
} from './selection';

export const PLANNER_ITEM_PANEL = 'Item details';

const SLIDE_IN = SlideInRight.duration(DURATION.mediumOut).easing(EASING.standard);

interface PanelData {
  readonly view: PlannerOccurrenceView | null;
  readonly views: readonly PlannerOccurrenceView[];
  readonly timeZone: string;
  readonly now: number;
  readonly watchLine: boolean;
}

function usePanelData(
  item: PlannerItemRow,
  selection: PlannerSelection,
  person: PlannerPerson,
): PanelData {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const day = panelDayOf(item, selection.occurrenceKey, timeZone);
  const window = dayWindowOf(day ?? localDayKey(now, timeZone), timeZone);
  const views = usePlannerRange(person, window.from, window.to, null).data?.occurrences ?? [];
  const view = day === null ? null : occurrenceIn(views, item.id, selection.occurrenceKey);
  const push = usePlannerPreferences(person).data?.watch.watch_calendar_push ?? false;
  const watch = useMyWatch() !== null && person === null;
  return { view, views, timeZone, now, watchLine: onWatchCalendar({ view, push, watch, now }) };
}

function PanelMenuButton({
  menu,
  title,
}: {
  readonly menu: ItemMenuItems;
  readonly title: string;
}): ReactNode {
  const anchored = useAnchoredMenu(menu.items, title, { quick: menu.quick });
  return (
    <View ref={anchored.ref} collapsable={false}>
      <IconButton icon="ellipsis" label="More options" onPress={anchored.open} />
      {anchored.menu}
    </View>
  );
}

function PanelHeader({
  item,
  menu,
  editing,
  onDoneEditing,
}: {
  readonly item: PlannerItemRow;
  readonly menu: ItemMenuItems;
  readonly editing: boolean;
  readonly onDoneEditing: () => void;
}): ReactNode {
  const { person } = usePlannerFrame();
  const collection = useItemCollections(person, item.collection_id).current;
  const source = item.google === null ? 'this hub' : 'Google';
  return (
    <View className="flex-row items-center gap-2 pb-1 pl-8 pr-2 pt-3">
      {collection === null ? null : (
        <View className={cn('size-3 rounded-full', LIST_DOT[collection.colour])} />
      )}
      <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
        {collection === null ? source : `${collection.name} · ${source}`}
      </Text>
      {editing ? (
        <Button label="Back to details" icon="arrowLeft" variant="text" onPress={onDoneEditing} />
      ) : null}
      <PanelMenuButton menu={menu} title={item.title} />
      <IconButton
        icon="close"
        label="Close details"
        shortcut="Esc"
        onPress={clearPlannerSelection}
      />
    </View>
  );
}

function Facts({
  item,
  data,
}: {
  readonly item: PlannerItemRow;
  readonly data: PanelData;
}): ReactNode {
  const today = { now: data.now, timeZone: data.timeZone };
  return (
    <View className="gap-2">
      <FactRow icon="clock" text={whenLineOf(item, data.view, today)} />
      {item.location === null ? null : <FactRow icon="mapPin" text={item.location} />}
      {item.reminders.length === 0 ? null : (
        <FactRow icon="bell" text={`Remind me ${reminderSummaryOf(item.reminders).value}`} />
      )}
      {data.watchLine ? (
        <FactRow
          icon="watch"
          text="On the watch calendar"
          trailing={<View className="size-2 rounded-full bg-positive" />}
        />
      ) : null}
    </View>
  );
}

function Notes({ notes }: { readonly notes: string }): ReactNode {
  if (notes === '') return null;
  return (
    <View className="gap-1 px-4">
      <Text variant="caption" tone="variant">
        Notes
      </Text>
      <Text variant="callout">{notes}</Text>
    </View>
  );
}

function ViewBody({
  item,
  selection,
}: {
  readonly item: PlannerItemRow;
  readonly selection: PlannerSelection;
}): ReactNode {
  const { person, offline } = usePlannerFrame();
  const data = usePanelData(item, selection, person);
  const editor = useItemEditor(item, { ...selection, person }, offline);
  const parent = useItemParent(item, person);
  const shown = editor.shown;
  const bar = data.view === null ? null : dayBarOf(data.views, data.view, data.now);
  const proposal = data.view === null ? null : proposalNear(data.views, data.view);
  const locked = offline || editor.busy;
  return (
    <View className="gap-4 px-4 pb-5">
      <View className="gap-2 px-4">
        <Text variant="title-2">{shown.title}</Text>
        <ItemMeta item={shown} collection={null} parent={parent} inPanel facts />
      </View>
      <RsvpBar item={item} person={person} disabled={offline} />
      <View className="px-4">
        <Facts item={shown} data={data} />
      </View>
      {bar === null ? null : <DayBarWell bar={bar} timeZone={data.timeZone} />}
      <ItemStepsFor item={item} person={person} disabled={offline} />
      <TaskRuleCard
        item={shown}
        person={person}
        personName={useOwnerName(item)}
        disabled={locked}
        onChange={editor.change}
      />
      <PanelAttachments
        item={shown}
        disabled={locked}
        picking={selection.intent === 'attach'}
        onChange={editor.change}
      />
      {item.kind === 'event' ? <ItemGuests item={item} person={person} disabled={offline} /> : null}
      <Notes notes={shown.notes} />
      {proposal === null ? null : (
        <PlanAroundCard
          person={person}
          proposal={proposal}
          timeZone={data.timeZone}
          offline={offline}
        />
      )}
      {editor.bar}
    </View>
  );
}

function focusOf(intent: PlannerSelection['intent']): ItemFocus | null {
  if (intent === 'reschedule') return { part: 'when', at: 1 };
  return intent === 'attach' ? { part: 'attach', at: 1 } : null;
}

function EditBody({
  item,
  selection,
}: {
  readonly item: PlannerItemRow;
  readonly selection: PlannerSelection;
}): ReactNode {
  const { person, offline } = usePlannerFrame();
  const target = { ...selection, person };
  const editor = useItemEditor(item, target, offline);
  const scope = useFrameActionScope(selection);
  return (
    <View className="gap-2 px-3 pb-5">
      <ItemBody
        item={item}
        editor={editor}
        target={target}
        scope={scope}
        focus={focusOf(selection.intent)}
        inPanel
        columns={false}
        offline={offline}
        onClose={clearPlannerSelection}
      />
      {editor.bar}
    </View>
  );
}

function PanelFooter({ onEdit }: { readonly onEdit: () => void }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2 border-t border-outline-variant px-4 py-3">
      <Button label="Edit" icon="pencil" variant="text" onPress={onEdit} />
    </View>
  );
}

function isEditing(intent: PlannerSelection['intent']): boolean {
  return intent === 'edit' || intent === 'reschedule';
}

function ItemPanel({
  item,
  selection,
}: {
  readonly item: PlannerItemRow;
  readonly selection: PlannerSelection;
}): ReactNode {
  const editing = isEditing(selection.intent);
  const target = { itemId: item.id, occurrenceKey: selection.occurrenceKey };
  const menu = useItemMenuItems(item, target, useFrameActionScope(target));
  const shift = (intent: PlannerSelection['intent']) => (): void => {
    selectPlannerItem({ ...selection, intent });
  };
  useEscape(true, clearPlannerSelection);
  useItemKeys(menu, !editing);
  return (
    <>
      <PanelHeader item={item} menu={menu} editing={editing} onDoneEditing={shift('view')} />
      <ScrollView className="flex-1" contentContainerClassName="pt-1">
        {editing ? (
          <EditBody item={item} selection={selection} />
        ) : (
          <ViewBody item={item} selection={selection} />
        )}
      </ScrollView>
      {editing ? null : <PanelFooter onEdit={shift('edit')} />}
    </>
  );
}

const selectLoaded = (state: StoreState): boolean => state.loaded;

function LoadingPanel(): ReactNode {
  return (
    <View accessible accessibilityLabel="Loading the item" className="gap-4 p-5">
      <Skeleton shape="line" className="h-8" />
      <Skeleton shape="text" />
      <Skeleton shape="block" />
    </View>
  );
}

function GonePanel(): ReactNode {
  return (
    <View className="flex-1 justify-center p-4">
      <EmptyState
        compact
        icon="calendar"
        title="This item is gone"
        body="It was deleted, or it belongs to someone else."
        action={<Button label="Close" variant="tonal" onPress={clearPlannerSelection} />}
      />
    </View>
  );
}

function SelectedPanel({ selection }: { readonly selection: PlannerSelection }): ReactNode {
  const { person } = usePlannerFrame();
  const item = useVisibleItem(person, selection.itemId);
  const loaded = useStoreSelector(selectLoaded);
  if (item === null) return loaded ? <GonePanel /> : <LoadingPanel />;
  return (
    <ItemPanel
      key={`${selection.itemId}:${selection.occurrenceKey ?? ''}:${selection.intent}`}
      item={item}
      selection={selection}
    />
  );
}

export function PlannerItemPanel(): ReactNode {
  const motion = useMotion();
  const width = usePanelWidth();
  const selection = usePlannerSelection();
  if (selection === null) return null;
  return (
    <DockedPane
      side="right"
      label={PLANNER_ITEM_PANEL}
      open
      width={width}
      minWidth={PANEL_WIDTH.min}
      maxWidth={PANEL_WIDTH.max}
      onResize={setPanelWidth}
      onOpenChange={(open) => {
        if (!open) clearPlannerSelection();
      }}
    >
      <Animated.View
        {...entering(motion, SLIDE_IN)}
        role="complementary"
        aria-label={PLANNER_ITEM_PANEL}
        className="h-full overflow-hidden bg-chrome"
      >
        <SelectedPanel selection={selection} />
      </Animated.View>
    </DockedPane>
  );
}
