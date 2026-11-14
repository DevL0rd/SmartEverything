import type { PlannerItemRow, PlannerOccurrenceView } from '@smarteverything/domain';
import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { Button } from '../../../components/button';
import { DockedPane } from '../../../components/docked-pane';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { OverflowButton } from '../../../components/menu';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { cn } from '../../../design/cn';
import { DURATION, EASING, entering, useMotion } from '../../../design/motion';
import { isNative } from '../../../design/platform';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useMyWatch } from '../../watches';
import {
  usePlannerCollections,
  usePlannerItems,
  usePlannerPreferences,
  usePlannerRange,
  type PlannerPerson,
} from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from './composer-tokens';
import { askAboutItem } from './item-ask';
import { reminderSummaryOf } from './item-fields';
import { useItemMenuItems, useItemActionRunner, type ItemTargetKey } from './item-menu-host';
import { itemMenuOf, itemShortcutOf, shortcutEntryOf } from './item-menu';
import { ItemBody, itemIn, useItemEditor } from './item-sheet';
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
  usePanelHost,
  usePanelWidth,
  usePlannerSelection,
  type PlannerSelection,
} from './selection';

const LABEL = 'Item details';

const SLIDE_IN = SlideInRight.duration(DURATION.mediumOut).easing(EASING.standard);

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function usePanelKeys(item: PlannerItemRow, target: ItemTargetKey, active: boolean): void {
  const { offline } = usePlannerFrame();
  const run = useItemActionRunner(item, target);
  const onKey = useEffectEvent((event: KeyboardEvent): void => {
    const shortcut = itemShortcutOf(event, isTextEntry(event.target));
    if (shortcut === null) return;
    const model = itemMenuOf({ item, occurrenceKey: target.occurrenceKey, offline });
    const entry = shortcutEntryOf(model, shortcut);
    if (entry === null) return;
    event.preventDefault();
    run(entry.action);
  });
  useEffect(() => {
    if (!active || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (!event.defaultPrevented) onKey(event);
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [active]);
}

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

function PanelHeader({
  item,
  target,
  editing,
  onDoneEditing,
}: {
  readonly item: PlannerItemRow;
  readonly target: ItemTargetKey;
  readonly editing: boolean;
  readonly onDoneEditing: () => void;
}): ReactNode {
  const { person } = usePlannerFrame();
  const collection = usePlannerCollections(person).find((row) => row.id === item.collection_id);
  const { quick, items } = useItemMenuItems(item, target);
  const source = item.google === null ? 'this hub' : 'Google';
  return (
    <View className="flex-row items-center gap-2 pb-1 pl-5 pr-2 pt-3">
      {collection === undefined ? null : (
        <View className={cn('size-3 rounded-full', LIST_DOT[collection.colour])} />
      )}
      <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
        {collection === undefined ? source : `${collection.name} · ${source}`}
      </Text>
      {editing ? <Button label="Done editing" variant="text" onPress={onDoneEditing} /> : null}
      <OverflowButton items={[...quick, ...items]} />
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
    <View className="gap-1">
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
  const shown = editor.shown;
  const bar = data.view === null ? null : dayBarOf(data.views, data.view, data.now);
  const proposal = data.view === null ? null : proposalNear(data.views, data.view);
  return (
    <View className="gap-4 px-5 pb-5">
      <Text variant="title-2">{shown.title}</Text>
      <Facts item={shown} data={data} />
      {bar === null ? null : <DayBarWell bar={bar} timeZone={data.timeZone} />}
      <PanelAttachments
        item={shown}
        disabled={offline || editor.busy}
        picking={selection.intent === 'attach'}
        onChange={editor.change}
      />
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
  return (
    <View className="gap-2 px-3 pb-5">
      <ItemBody
        item={item}
        editor={editor}
        target={target}
        offline={offline}
        onClose={clearPlannerSelection}
      />
      {editor.bar}
    </View>
  );
}

function PanelFooter({
  onEdit,
  onAsk,
}: {
  readonly onEdit: () => void;
  readonly onAsk: () => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2 border-t border-outline-variant px-4 py-3">
      <Button label="Edit" icon="pencil" variant="text" onPress={onEdit} />
      <Button label="Ask AI about this" icon="messageCircle" variant="text" onPress={onAsk} />
    </View>
  );
}

function ItemPanel({
  item,
  selection,
}: {
  readonly item: PlannerItemRow;
  readonly selection: PlannerSelection;
}): ReactNode {
  const editing = selection.intent === 'edit';
  const target = { itemId: item.id, occurrenceKey: selection.occurrenceKey };
  const shift = (intent: PlannerSelection['intent']) => (): void => {
    selectPlannerItem({ ...selection, intent });
  };
  useEscape(true, clearPlannerSelection);
  usePanelKeys(item, target, !editing);
  return (
    <>
      <PanelHeader item={item} target={target} editing={editing} onDoneEditing={shift('view')} />
      <ScrollView className="flex-1" contentContainerClassName="pt-1">
        {editing ? (
          <EditBody item={item} selection={selection} />
        ) : (
          <ViewBody item={item} selection={selection} />
        )}
      </ScrollView>
      {editing ? null : (
        <PanelFooter
          onEdit={shift('edit')}
          onAsk={() => {
            askAboutItem(item, selection.occurrenceKey);
          }}
        />
      )}
    </>
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
  const item = itemIn(usePlannerItems(person), selection.itemId);
  if (item === null) return <GonePanel />;
  return (
    <ItemPanel
      key={`${selection.itemId}:${selection.occurrenceKey ?? ''}:${selection.intent}`}
      item={item}
      selection={selection}
    />
  );
}

export function PlannerItemPanel(): ReactNode {
  usePanelHost();
  const motion = useMotion();
  const width = usePanelWidth();
  const selection = usePlannerSelection();
  if (selection === null) return null;
  return (
    <DockedPane
      side="right"
      label={LABEL}
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
        aria-label={LABEL}
        className="h-full overflow-hidden rounded-lg border-hairline border-outline-variant bg-chrome"
      >
        <SelectedPanel selection={selection} />
      </Animated.View>
    </DockedPane>
  );
}
