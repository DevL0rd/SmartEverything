import type { PlannerColourKey, PlannerDay } from '@smarteverything/domain';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { SwipeRow, type SwipeAction } from '../../../components/swipe-row';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import {
  usePlannerCollections,
  usePlannerItems,
  usePlannerPreferences,
  useVisibleMinuteOf,
} from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from '../item/composer-tokens';
import { bookedMinutesOf } from './day-strip-model';
import { useHiddenKeys, useOccurrenceActions, type OccurrenceActions } from './now-lens';
import {
  fadeStepsOf,
  riverCaptionOf,
  riverRowsOf,
  sameSteps,
  type RiverRow,
  type RiverStep,
} from './river-model';

const ROW_HEIGHT: Readonly<Record<RiverStep, string>> = {
  0: 'min-h-14',
  1: 'min-h-13',
  2: 'min-h-11.5',
  3: 'min-h-10.5',
  4: 'min-h-10',
};

const SPINE: Readonly<Record<RiverStep, string>> = {
  0: 'opacity-100',
  1: 'opacity-80',
  2: 'opacity-60',
  3: 'opacity-45',
  4: 'opacity-32',
};

const NEAR: ReadonlySet<RiverStep> = new Set([0, 1]);
const BRIGHT: ReadonlySet<RiverStep> = new Set([0, 1, 2]);

function dotOf(colour: PlannerColourKey | null): string {
  return colour === null ? 'bg-on-surface-variant' : LIST_DOT[colour];
}

function TimeColumn({
  row,
  step,
}: {
  readonly row: RiverRow;
  readonly step: RiverStep;
}): ReactNode {
  const near = NEAR.has(step);
  return (
    <View className={cn('w-11', near ? 'pt-1.5' : 'pt-1')}>
      <Text
        variant={near ? 'callout' : 'caption'}
        tone="variant"
        numberOfLines={2}
        className={cn('tabular', near ? 'font-mono-medium' : 'font-mono')}
      >
        {row.time}
      </Text>
    </View>
  );
}

function Spine({ row, step }: { readonly row: RiverRow; readonly step: RiverStep }): ReactNode {
  return (
    <View aria-hidden className="w-3 items-center pt-2.5">
      <View className={cn('size-2.5 rounded-full', dotOf(row.colour), SPINE[step])} />
      <View className={cn('mt-1 w-px flex-1 bg-outline', SPINE[step])} />
    </View>
  );
}

function CalendarPill({ row }: { readonly row: RiverRow }): ReactNode {
  if (row.calendar === null) return null;
  return (
    <View className="shrink flex-row items-center gap-1.5 rounded-full bg-surface-3 px-2 py-0.5">
      <View className={cn('size-2 rounded-full', dotOf(row.colour))} />
      <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
        {row.calendar}
      </Text>
    </View>
  );
}

function GoogleMark({ row }: { readonly row: RiverRow }): ReactNode {
  if (!row.google) return null;
  return (
    <View className="flex-row items-center gap-1">
      <View className="h-4.5 min-w-4.5 items-center justify-center rounded-full bg-surface-3 px-1">
        <Text variant="caption" tone="variant">
          G
        </Text>
      </View>
      {row.sending ? <Icon name="refresh" size={12} tone="faint" /> : null}
    </View>
  );
}

function Body({ row, step }: { readonly row: RiverRow; readonly step: RiverStep }): ReactNode {
  const bright = BRIGHT.has(step);
  return (
    <View
      className={cn(
        'min-w-0 flex-1 flex-row items-center gap-3',
        bright ? 'pb-3 pt-1' : 'pb-2 pt-0.5',
      )}
    >
      <View className="min-w-0 flex-1">
        <Text
          variant={NEAR.has(step) ? 'body-strong' : bright ? 'label' : 'callout'}
          tone={bright ? 'default' : 'variant'}
          numberOfLines={1}
        >
          {row.title}
        </Text>
        {row.subtitle === null ? null : (
          <Text variant="callout" tone="variant" numberOfLines={1}>
            {row.subtitle}
          </Text>
        )}
      </View>
      <CalendarPill row={row} />
      <GoogleMark row={row} />
    </View>
  );
}

function swipesOf(
  row: RiverRow,
  actions: OccurrenceActions,
  offline: boolean,
): { readonly leading?: SwipeAction; readonly trailing?: SwipeAction } {
  if (offline || row.occurrence.kind !== 'task') return {};
  return {
    leading: {
      label: 'Done',
      icon: 'check',
      tone: 'primary',
      onCommit: (): void => {
        actions.done(row.key, row.occurrence);
      },
    },
    trailing: {
      label: 'Skip',
      icon: 'skipForward',
      tone: 'neutral',
      onCommit: (): void => {
        actions.skip(row.key, row.occurrence);
      },
    },
  };
}

interface RowProps {
  readonly row: RiverRow;
  readonly step: RiverStep;
  readonly actions: OccurrenceActions;
}

function RiverItem({ row, step, actions }: RowProps): ReactNode {
  const { offline } = usePlannerFrame();
  return (
    <SwipeRow {...swipesOf(row, actions, offline)}>
      <Interactive
        href={href.planner.item(row.occurrence.item_id)}
        label={row.spoken}
        className={cn('flex-row gap-3 rounded-sm', ROW_HEIGHT[step])}
        layerClassName="rounded-sm"
        focusInset
      >
        <TimeColumn row={row} step={step} />
        <Spine row={row} step={step} />
        <Body row={row} step={step} />
      </Interactive>
    </SwipeRow>
  );
}

function useRiverRows(day: PlannerDay, hidden: ReadonlySet<string>): readonly RiverRow[] {
  const { person } = usePlannerFrame();
  return riverRowsOf({
    day,
    collections: usePlannerCollections(person),
    items: usePlannerItems(person),
    hidden,
  });
}

export function DayRiver({
  day,
  savedAt,
}: {
  readonly day: PlannerDay;
  readonly savedAt: number | null;
}): ReactNode {
  const { person } = usePlannerFrame();
  const fade = usePlannerPreferences(person).data?.day_planner.fade ?? 'off';
  const [hidden, hide] = useHiddenKeys();
  const actions = useOccurrenceActions(day, hide);
  const rows = useRiverRows(day, hidden);
  const ref = useRef<View>(null);
  const steps = useVisibleMinuteOf(ref, (now) => fadeStepsOf(rows, now, fade), sameSteps);
  if (rows.length === 0) return null;
  const caption = riverCaptionOf({
    left: rows.length,
    bookedMinutes: savedAt === null ? bookedMinutesOf(day) : 0,
    savedAt,
    timeZone: day.time_zone,
  });
  return (
    <View ref={ref} onLayout={steps.onLayout} className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="label">Rest of today</Text>
        <Text variant="caption" tone="variant" className="tabular">
          {caption}
        </Text>
      </View>
      <View>
        {rows.map((row, index) => (
          <RiverItem key={row.key} row={row} step={steps.value[index] ?? 0} actions={actions} />
        ))}
      </View>
    </View>
  );
}
