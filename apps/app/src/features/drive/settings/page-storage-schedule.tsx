import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import type { View } from 'react-native';
import {
  SCHEDULE_LIMITS,
  isScheduleActive,
  type ScheduleRow,
  type ScheduleStepInput,
  type ScheduleTimingInput,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { Sheet } from '../../../components/sheet';
import { notify } from '../../../components/toast-store';
import { createSchedule, type ScheduleInput } from '../../../api/schedules';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useRows, useSettings } from '../../../store/selectors';
import { trackSetting } from '../../settings/settings-log';
import { daysText } from './page-sharing';

const DAY_SECONDS = 86_400;

export const SCRUB_TOOL = 'drive_edit';

export const SCRUB_ACTION = 'scrub_start';

export const SCRUB_SCHEDULE_LABEL = 'Check Drive files for damage';

export const MOST_DAYS = Math.floor(SCHEDULE_LIMITS.horizonSeconds / DAY_SECONDS);

export const FIRST_DAYS = 30;

function isScrubStep(step: ScheduleRow['steps'][number]): boolean {
  return step.kind === 'tool' && step.tool === SCRUB_TOOL && step.args['action'] === SCRUB_ACTION;
}

export function scrubScheduleOf(rows: readonly ScheduleRow[]): ScheduleRow | null {
  return rows.find((row) => isScheduleActive(row.state) && row.steps.some(isScrubStep)) ?? null;
}

export function scrubTimingOf(days: number): ScheduleTimingInput {
  const everySeconds = days * DAY_SECONDS;
  return {
    kind: 'series',
    everySeconds,
    count: Math.min(
      SCHEDULE_LIMITS.occurrences,
      Math.floor(SCHEDULE_LIMITS.horizonSeconds / everySeconds),
    ),
    startAt: null,
  };
}

export function scrubScheduleBody(days: number): ScheduleInput {
  const step: ScheduleStepInput = {
    kind: 'tool',
    tool: SCRUB_TOOL,
    args: { action: SCRUB_ACTION },
  };
  return { label: SCRUB_SCHEDULE_LABEL, timing: scrubTimingOf(days), steps: [step] };
}

export async function saveScrubSchedule(days: number): Promise<ScheduleRow> {
  const saved = await trackSetting('drive_scrub.schedule', { days }, () =>
    createSchedule(scrubScheduleBody(days)),
  );
  return saved.schedule;
}

export function everyText(days: number): string {
  return days === 1 ? 'Every day' : `Every ${daysText(days)}`;
}

export function scheduleValueOf(row: ScheduleRow): string {
  return row.timing.kind === 'series' && row.timing.everySeconds % DAY_SECONDS === 0
    ? everyText(row.timing.everySeconds / DAY_SECONDS)
    : 'Scheduled';
}

export function scheduleLineOf(row: ScheduleRow, now: number, zone: string): string {
  if (row.state === 'running') return `${scheduleValueOf(row)} · checking now`;
  if (row.next_at === null) return scheduleValueOf(row);
  return `${scheduleValueOf(row)} · next ${moment(row.next_at, now, zone)}`;
}

function ScheduledRow({ row }: { readonly row: ScheduleRow }): ReactNode {
  const line = scheduleLineOf(row, useMinute(), useSettings().time_zone);
  return (
    <ListRow
      title="Check on a schedule"
      icon="calendar"
      subtitle={line}
      wrapSubtitle
      chevron
      href={href.scheduledItem(row.id)}
    />
  );
}

function ScheduleSheet({
  opener,
  onClose,
}: {
  readonly opener: RefObject<View | null>;
  readonly onClose: () => void;
}): ReactNode {
  const [days, setDays] = useState(FIRST_DAYS);
  const mutation = useMutationState();
  const save = (): void => {
    mutation.run(() => saveScrubSchedule(days), {
      failure: 'The schedule was not saved',
      label: 'drive_scrub.schedule',
      onDone: () => {
        notify({ message: `Files are checked ${everyText(days).toLowerCase()}` });
        onClose();
      },
    });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Check files on a schedule"
      detents={['fit']}
      subpage={{ opener }}
      footer={<Button label="Save schedule" loading={mutation.busy} onPress={save} />}
    >
      <NumberStepper
        label="How often"
        value={days}
        min={1}
        max={MOST_DAYS}
        step={1}
        formatValue={everyText}
        onChange={setDays}
      />
    </Sheet>
  );
}

function UnscheduledRow(): ReactNode {
  const opener = useRef<View>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title="Check on a schedule"
        icon="calendar"
        subtitle="Not scheduled · files are checked only when you press Scrub now"
        wrapSubtitle
        chevron
        pressRef={opener}
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <ScheduleSheet
          opener={opener}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function ScrubScheduleRow(): ReactNode {
  const row = scrubScheduleOf(useRows('scheduled_actions'));
  return row === null ? <UnscheduledRow /> : <ScheduledRow row={row} />;
}
