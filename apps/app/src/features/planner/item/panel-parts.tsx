import type { PlannerItemRow, PlannerOccurrenceView } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { percentOf } from '../../../format/percent';
import { clock, dayBoundsOf, localDayKey } from '../../../format/time';
import { usePlannerTools, usePlannerWrites, type PlannerPerson } from '../data';
import { AttachmentChips, useAttachmentNames, withoutAttachment } from './attachment-chips';
import { AttachmentPicker } from './attachment-picker';
import { dayLabelOf, whenTextOf, type FieldsToday } from './item-history';
import {
  fractionIn,
  lengthMinutesOf,
  movedSpanOf,
  spanOf,
  type BarBlockKind,
  type DayBar,
  type Span,
} from './panel-model';
import type { ItemChanges } from './repeat-scope-bar';

export function whenLineOf(
  item: PlannerItemRow,
  view: PlannerOccurrenceView | null,
  today: FieldsToday,
): string {
  const span = view === null ? null : spanOf(view);
  if (span === null) return whenTextOf(item, today);
  const day = dayLabelOf(localDayKey(span.from, today.timeZone), today);
  const start = clock(span.from, today.timeZone);
  if (span.to === span.from) return `${day}, ${start}`;
  return `${day}, ${start} to ${clock(span.to, today.timeZone)}`;
}

export function FactRow({
  icon,
  text,
  trailing = null,
}: {
  readonly icon: IconName;
  readonly text: string;
  readonly trailing?: ReactNode;
}): ReactNode {
  return (
    <View className="min-h-7 flex-row items-center gap-3">
      <Icon name={icon} size={20} tone="variant" />
      <Text variant="callout" className="min-w-0 flex-1 tabular">
        {text}
      </Text>
      {trailing}
    </View>
  );
}

const BLOCK_FILL: Readonly<Record<BarBlockKind, string>> = {
  focus: 'bg-primary',
  busy: 'bg-viz-3/60',
  proposed: 'border border-dashed border-primary bg-transparent',
};

const MIN_SHARE = 0.01;

function placeOf(
  bar: DayBar,
  from: number,
  to: number,
): { readonly left: `${number}%`; readonly width: `${number}%` } {
  const left = fractionIn(bar, from);
  return {
    left: percentOf(left),
    width: percentOf(Math.max(MIN_SHARE, fractionIn(bar, to) - left)),
  };
}

function nowAt(bar: DayBar, now: number): { readonly left: `${number}%` } {
  return { left: percentOf(fractionIn(bar, now)) };
}

function freeTextOf(free: Span, timeZone: string): string {
  return `free ${clock(free.from, timeZone)} to ${clock(free.to, timeZone)}`;
}

function barSpokenOf(bar: DayBar, timeZone: string): string {
  const busy = bar.blocks.filter((block) => block.kind === 'busy').length;
  const free = bar.free === null ? 'no free time just before it' : freeTextOf(bar.free, timeZone);
  return `Around it: ${String(busy)} other booked, ${free}`;
}

function BarTrack({
  bar,
  timeZone,
}: {
  readonly bar: DayBar;
  readonly timeZone: string;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={barSpokenOf(bar, timeZone)}
      className="h-8 justify-center"
    >
      <View className="relative h-5 overflow-hidden rounded-sm bg-surface-3">
        {bar.free === null ? null : (
          <View
            style={placeOf(bar, bar.free.from, bar.free.to)}
            className="absolute inset-y-0 bg-positive/16"
          />
        )}
        {bar.blocks.map((block) => (
          <View
            key={block.key}
            style={placeOf(bar, block.from, block.to)}
            className={cn('absolute inset-y-0 rounded-xs', BLOCK_FILL[block.kind])}
          />
        ))}
      </View>
      {bar.now === null ? null : (
        <View
          style={nowAt(bar, bar.now)}
          className="absolute inset-y-0 w-0.5 rounded-full bg-on-surface"
        />
      )}
    </View>
  );
}

export function DayBarWell({
  bar,
  timeZone,
}: {
  readonly bar: DayBar;
  readonly timeZone: string;
}): ReactNode {
  return (
    <View className="gap-2 rounded-lg bg-surface-2 p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="label">Around it</Text>
        {bar.free === null ? null : (
          <Text variant="caption" tone="variant" className="tabular">
            {freeTextOf(bar.free, timeZone)}
          </Text>
        )}
      </View>
      <BarTrack bar={bar} timeZone={timeZone} />
      <View className="flex-row justify-between">
        <Text variant="caption" tone="faint" className="tabular">
          {clock(bar.from, timeZone)}
        </Text>
        <Text variant="caption" tone="faint" className="tabular">
          {clock(bar.to, timeZone)}
        </Text>
      </View>
    </View>
  );
}

class NoOtherTime extends Error {
  constructor() {
    super('No other free time is left that day.');
  }
}

interface PlanInput {
  readonly person: PlannerPerson;
  readonly proposal: PlannerOccurrenceView;
  readonly timeZone: string;
}

function usePlanActions({ person, proposal, timeZone }: PlanInput): {
  readonly accept: () => void;
  readonly retry: () => void;
} {
  const tools = usePlannerTools(person);
  const writes = usePlannerWrites(person);
  const span = spanOf(proposal);
  const retry = async (): Promise<void> => {
    const from = span === null ? Date.now() : span.to;
    const end = dayBoundsOf(localDayKey(from, timeZone), timeZone).end;
    const minutes = lengthMinutesOf(proposal);
    const slots = await tools.freeSlots({
      from: new Date(from).toISOString(),
      to: new Date(end).toISOString(),
      minutes,
    });
    const slot = slots[0];
    if (slot === undefined) throw new NoOtherTime();
    await writes.moveItem(proposal.item_id, {
      occurrence_key: proposal.occurrence_key,
      ...movedSpanOf(slot.from, minutes),
    });
  };
  const run = (work: () => Promise<unknown>, message: string): void => {
    background(
      work().catch((error: unknown) => {
        notify({ message, error, tone: 'critical' });
      }),
      'planner.panel_plan_failed',
    );
  };
  return {
    accept: (): void => {
      run(() => tools.acceptProposal(proposal.item_id), 'Couldn’t book that');
    },
    retry: (): void => {
      run(retry, 'Couldn’t find another time');
    },
  };
}

export function PlanAroundCard(props: PlanInput & { readonly offline: boolean }): ReactNode {
  const { proposal, timeZone, offline } = props;
  const actions = usePlanActions(props);
  const span = spanOf(proposal);
  const when =
    span === null
      ? 'fits later that day'
      : `fits ${clock(span.from, timeZone)} to ${clock(span.to, timeZone)}`;
  return (
    <View className="gap-2 rounded-lg border-hairline border-outline-variant bg-primary/6 p-3">
      <View className="flex-row items-center gap-2">
        <Icon name="sparkles" size={16} tone="primary" />
        <Text variant="label">Plan around it</Text>
      </View>
      <Text variant="caption" tone="variant">{`${proposal.title} ${when}.`}</Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Accept"
          icon="check"
          variant="tonal"
          disabled={offline}
          onPress={actions.accept}
        />
        <Button
          label="Try another time"
          variant="text"
          disabled={offline}
          onPress={actions.retry}
        />
      </View>
    </View>
  );
}

export interface PanelAttachmentsProps {
  readonly item: PlannerItemRow;
  readonly disabled: boolean;
  readonly picking: boolean;
  readonly onChange: (changes: ItemChanges) => void;
}

export function PanelAttachments({
  item,
  disabled,
  picking,
  onChange,
}: PanelAttachmentsProps): ReactNode {
  const [open, setOpen] = useState(picking);
  const opener = useRef<View>(null);
  const names = useAttachmentNames();
  return (
    <>
      <AttachmentChips
        attachments={item.attachments}
        names={names}
        disabled={disabled}
        addRef={opener}
        onAdd={() => {
          setOpen(true);
        }}
        onRemove={(key) => {
          onChange({ attachments: withoutAttachment(item.attachments, key) });
        }}
      />
      {open ? (
        <AttachmentPicker
          opener={opener}
          item={item}
          names={names}
          disabled={disabled}
          onAttach={(added) => {
            onChange({ attachments: [...item.attachments, ...added] });
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
