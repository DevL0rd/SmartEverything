import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu } from '../../../components/menu';
import { useFrameBodyWidth } from '../../../components/page-shell/body-width';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useIdiom } from '../../../design/platform';
import { VIEW_OPTIONS } from '../settings/options';
import type { CalendarView } from './calendar-view-model';

export interface CalendarState {
  readonly view: CalendarView;
  readonly day: string;
  readonly views: readonly CalendarView[];
  readonly setView: (view: CalendarView) => void;
  readonly setDay: (day: string) => void;
  readonly previous: () => void;
  readonly next: () => void;
  readonly toToday: () => void;
}

function viewLabelOf(view: CalendarView): string {
  return VIEW_OPTIONS.find((option) => option.value === view)?.label ?? view;
}

function ViewMenu({ state }: { readonly state: CalendarState }): ReactNode {
  const items = state.views.map((view) => ({
    label: viewLabelOf(view),
    selected: view === state.view,
    onPress: (): void => {
      state.setView(view);
    },
  }));
  const { ref, open, menu } = useAnchoredMenu(items, 'Calendar view');
  const label = viewLabelOf(state.view);
  return (
    <View ref={ref} collapsable={false} className="min-w-0 shrink flex-row">
      <Button
        label={label}
        spoken={`Calendar view: ${label}`}
        icon="calendar"
        variant="outlined"
        onPress={open}
      />
      {menu}
    </View>
  );
}

function DateNav({ state }: { readonly state: CalendarState }): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      <IconButton icon="chevronLeft" label="Previous" onPress={state.previous} />
      <Button label="Today" variant="outlined" onPress={state.toToday} />
      <IconButton icon="chevronRight" label="Next" onPress={state.next} />
    </View>
  );
}

const SEGMENTED_ROW = { pointer: 680, touch: 840 } as const;

export function Toolbar({ state }: { readonly state: CalendarState }): ReactNode {
  const idiom = useIdiom();
  const { width, onLayout } = useMeasuredWidth(undefined, useFrameBodyWidth());
  const segmented = width >= SEGMENTED_ROW[idiom];
  return (
    <View
      onLayout={onLayout}
      className="min-w-0 flex-1 flex-row items-center justify-between gap-2"
    >
      {segmented ? (
        <Segmented
          label="Calendar view"
          options={state.views.map((view) => ({ value: view, label: viewLabelOf(view) }))}
          value={state.view}
          onChange={state.setView}
        />
      ) : (
        <ViewMenu state={state} />
      )}
      <DateNav state={state} />
    </View>
  );
}

export function ToolbarPlaceholder(): ReactNode {
  const idiom = useIdiom();
  const { width, onLayout } = useMeasuredWidth(undefined, useFrameBodyWidth());
  const segmented = width >= SEGMENTED_ROW[idiom];
  return (
    <View
      aria-hidden
      onLayout={onLayout}
      className="min-w-0 flex-1 flex-row items-center justify-between gap-2"
    >
      <Skeleton
        shape="line"
        className={segmented ? 'h-9 w-96 min-w-0 shrink' : 'h-9 w-24 min-w-0 shrink'}
      />
      <Skeleton shape="line" className="h-11 w-32 min-w-0 shrink" />
    </View>
  );
}
