import { useState } from 'react';
import { laundryProgramByRaw, type LaundryProgram } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useControl, type Control } from '../../../store/control';
import { draftOf, programOf, reportedOf, type OptionChanges, type Reported } from './draft';
import { defaultFinish, epochMinute, finishError } from './finish';
import type { Laundry } from './use-laundry';
import { useStarter } from './use-starter';

interface Changes {
  readonly program: string | null;
  readonly values: OptionChanges;
}

export interface DraftHandle {
  readonly program: LaundryProgram | undefined;
  readonly shown: Reported;
  readonly change: (changes: OptionChanges) => void;
  readonly pick: (program: LaundryProgram) => void;
  readonly picking: boolean;
  readonly pickFailure: string | null;
  readonly locked: boolean;
  readonly finishAt: number | null;
  readonly setFinishAt: (at: number | null) => void;
  readonly enterFinish: () => void;
  readonly estimate: number | null;
  readonly problemAt: (nowMinute: number) => string | null;
  readonly reason: string | null;
  readonly starting: boolean;
  readonly failure: string | null;
  readonly start: () => void;
}

function pick<T>(next: T | undefined, base: T): T {
  return next ?? base;
}

function mergedShown(reported: Reported, values: OptionChanges): Reported {
  return {
    temperature: pick(values.temperature, reported.temperature),
    spin: pick(values.spin, reported.spin),
    rinses: pick(values.rinses, reported.rinses),
    soakMinutes: pick(values.soakMinutes, reported.soakMinutes),
    washMinutes: pick(values.washMinutes, reported.washMinutes),
    dryMode: pick<string | null>(values.dryMode, reported.dryMode),
    dryMinutes: pick(values.dryMinutes, reported.dryMinutes),
    dryTarget: pick<string | null>(values.dryTarget, reported.dryTarget),
    steam: pick(values.steam, reported.steam),
    extraWater: pick(values.extraWater, reported.extraWater),
    quiet: pick(values.quiet, reported.quiet),
    antiCreaseMinutes: pick(values.antiCreaseMinutes, reported.antiCreaseMinutes),
  };
}

function estimateOf(laundry: Laundry): number | null {
  const left = laundry.snapshot.values.remaining_minutes;
  return laundry.state.running || typeof left !== 'number' || left <= 0 ? null : left;
}

function useSelection(laundry: Laundry): {
  readonly picker: Control;
  readonly program: LaundryProgram | undefined;
  readonly locked: boolean;
} {
  const picker = useControl(laundry.device.id, laundry.keyOf('laundry_program') ?? '');
  const sent =
    picker.failure === null && typeof picker.value === 'string'
      ? laundryProgramByRaw(picker.value)
      : undefined;
  return {
    picker,
    program: sent ?? programOf(laundry.snapshot.values),
    locked: laundry.state.offline || laundry.state.readiness !== null,
  };
}

function useFinish(
  estimate: number | null,
): Pick<DraftHandle, 'finishAt' | 'setFinishAt' | 'enterFinish' | 'problemAt'> {
  const [finishAt, setFinishAt] = useState<number | null>(null);
  return {
    finishAt,
    setFinishAt,
    enterFinish: (): void => {
      setFinishAt(defaultFinish(Date.now(), estimate));
    },
    problemAt: (nowMinute) =>
      finishAt === null ? null : finishError(finishAt, nowMinute, estimate),
  };
}

export function useLaundryDraft(laundry: Laundry): DraftHandle {
  const [changes, setChanges] = useState<Changes>({ program: null, values: {} });
  const starter = useStarter(laundry);
  const { snapshot } = laundry;
  const { picker, program, locked } = useSelection(laundry);
  const values = changes.program === (program?.raw ?? null) ? changes.values : {};
  const estimate = estimateOf(laundry);
  const { finishAt, setFinishAt, enterFinish, problemAt } = useFinish(estimate);
  const reason = laundry.state.readiness;
  return {
    program,
    shown: mergedShown(reportedOf(snapshot.values), values),
    change: (next): void => {
      starter.clear();
      setChanges({ program: program?.raw ?? null, values: { ...values, ...next } });
    },
    picking: picker.pending,
    pickFailure: picker.failure,
    locked,
    pick: (entry): void => {
      if (locked) {
        return;
      }
      starter.clear();
      setChanges({ program: entry.raw, values: {} });
      background(picker.set(entry.raw), 'laundry.pick_failed');
    },
    finishAt,
    setFinishAt,
    enterFinish,
    estimate,
    problemAt,
    reason,
    starting: starter.starting,
    failure: starter.failure,
    start: (): void => {
      const now = epochMinute(Date.now());
      if (program === undefined || reason !== null) {
        return;
      }
      if (finishAt !== null && finishError(finishAt, now, estimate) !== null) {
        return;
      }
      starter.send(draftOf({ program, changes: values, finishAt, nowMinute: now }), () => {
        setChanges({ program: null, values: {} });
        setFinishAt(null);
      });
    },
  };
}
