import type { PlannerAlarmRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState } from 'react';
import { confirm } from '../../../components/confirm-store';
import { notifyFailure } from '../../../components/toast-store';
import {
  alarmLabelOf,
  useAlarmSaves,
  type AlarmChange,
  usePlannerClockWrites,
  usePlannerWrites,
  type PlannerPerson,
} from '../../planner';
import {
  appliedEdit,
  changeOf,
  createBodyOf,
  draftOf,
  type AlarmDraft,
  type AlarmEdit,
} from './alarm-draft';
import { useClockLabel } from '../format/clock-format';

export interface AlarmEditing {
  readonly draft: AlarmDraft;
  readonly alarm: PlannerAlarmRow | null;
  readonly busy: boolean;
  readonly change: (edit: AlarmEdit) => void;
  readonly create: () => void;
  readonly skipNext: () => void;
  readonly ringNextAgain: () => void;
  readonly remove: () => void;
}

export interface AlarmEditTarget {
  readonly person: PlannerPerson;
  readonly alarm: PlannerAlarmRow | null;
  readonly fresh: AlarmDraft;
  readonly onCreated: (alarm: PlannerAlarmRow) => void;
  readonly onDeleted: () => void;
}

interface Runner {
  readonly busy: boolean;
  readonly run: (failure: string, work: () => Promise<unknown>) => void;
}

function useRunner(): Runner {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: (failure, work): void => {
      setBusy(true);
      background(
        work()
          .catch(notifyFailure(failure))
          .finally(() => {
            setBusy(false);
          }),
        'clock.alarm_edit_failed',
      );
    },
  };
}

async function confirmedDelete(alarm: PlannerAlarmRow, time: string): Promise<boolean> {
  return confirm({
    title: `Delete ${time} ${alarmLabelOf(alarm)}?`,
    body: 'It stops ringing on every device it was set for.',
    confirmLabel: 'Delete alarm',
    tone: 'destructive',
  });
}

function useEditedAlarm(target: AlarmEditTarget): {
  readonly alarm: PlannerAlarmRow | null;
  readonly save: (change: AlarmChange) => void;
} {
  const { unsaved, save } = useAlarmSaves(target.person, target.alarm?.id ?? null);
  const alarm = target.alarm;
  return { alarm: alarm === null || unsaved === null ? alarm : { ...alarm, ...unsaved }, save };
}

export function useAlarmEdit(target: AlarmEditTarget): AlarmEditing {
  const { person, fresh, onCreated, onDeleted } = target;
  const writes = usePlannerWrites(person);
  const clock = usePlannerClockWrites(person);
  const [draft, setDraft] = useState(fresh);
  const { busy, run } = useRunner();
  const { alarm, save } = useEditedAlarm(target);
  const clockLabel = useClockLabel();
  const change = (edit: AlarmEdit): void => {
    if (alarm === null) {
      setDraft((current) => appliedEdit(current, edit));
      return;
    }
    const body = changeOf(alarm, edit);
    if (body !== null) save(body);
  };
  return {
    draft: alarm === null ? draft : draftOf(alarm),
    alarm,
    busy,
    change,
    create: (): void => {
      run('Couldn’t add that alarm', () => writes.createAlarm(createBodyOf(draft)).then(onCreated));
    },
    skipNext: (): void => {
      if (alarm !== null) run('Couldn’t skip that alarm', () => clock.skipNextAlarm(alarm.id));
    },
    ringNextAgain: (): void => {
      if (alarm !== null) save({ skip_on: null });
    },
    remove: (): void => {
      if (alarm === null) return;
      run('Couldn’t delete that alarm', async () => {
        if (!(await confirmedDelete(alarm, clockLabel(alarm.time)))) return;
        await writes.deleteAlarm(alarm);
        onDeleted();
      });
    },
  };
}
