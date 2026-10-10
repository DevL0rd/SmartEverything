import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { Action, ScheduleRow, ScheduleStepInput } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { changeList, type ListChange } from '../model/editor-state';
import { saveScheduled, type ScheduleSave } from './actions';
import { actionsOf, stepsOf } from './steps';
import { DEFAULT_WHEN, timingOf, whenLabel, whenOf, type When } from './when';

export interface ScheduleDraft {
  readonly label: string;
  readonly when: When | null;
  readonly actions: readonly Action[] | null;
}

export interface ScheduleEditor {
  readonly draft: ScheduleDraft;
  readonly problem: string | null;
  readonly saving: boolean;
  readonly setLabel: (label: string) => void;
  readonly setWhen: (when: When) => void;
  readonly changeActions: (change: ListChange<Action>) => void;
  readonly save: () => void;
}

export function newDraft(actions: readonly Action[]): ScheduleDraft {
  return { label: '', when: DEFAULT_WHEN, actions };
}

export function draftOf(row: ScheduleRow, zone: string, now: number): ScheduleDraft {
  return {
    label: row.label ?? '',
    when: whenOf(row.timing, zone, now),
    actions: actionsOf(row.steps),
  };
}

interface Touched {
  readonly when: boolean;
  readonly actions: boolean;
}

function labelOf(draft: ScheduleDraft): string | null {
  const label = draft.label.trim();
  return label === '' ? null : label;
}

function updateOf(
  draft: ScheduleDraft,
  id: string,
  steps: ScheduleStepInput[] | null,
  touched: Touched,
): ScheduleSave {
  return {
    kind: 'update',
    id,
    body: {
      label: labelOf(draft),
      ...(touched.when && draft.when !== null ? { timing: timingOf(draft.when) } : {}),
      ...(touched.actions && steps !== null ? { steps } : {}),
    },
  };
}

function saveOf(
  draft: ScheduleDraft,
  savedId: string | null,
  touched: Touched,
): ScheduleSave | string {
  const steps = draft.actions === null ? null : stepsOf(draft.actions);
  if (steps !== null && steps.length === 0) {
    return 'Add at least one step.';
  }
  if (savedId !== null) {
    return updateOf(draft, savedId, steps, touched);
  }
  if (draft.when === null || steps === null) {
    return 'Pick when it runs and what it does.';
  }
  return { kind: 'create', body: { label: labelOf(draft), timing: timingOf(draft.when), steps } };
}

export function useScheduleEditor(start: ScheduleDraft, savedId: string | null): ScheduleEditor {
  const router = useRouter();
  const [draft, setDraft] = useState(start);
  const [touched, setTouched] = useState<Touched>({ when: false, actions: false });
  const [problem, setProblem] = useState<string | null>(null);
  const mutation = useMutationState();
  const save = (): void => {
    const planned = saveOf(draft, savedId, touched);
    if (typeof planned === 'string') {
      setProblem(planned);
      return;
    }
    setProblem(null);
    mutation.run(() => saveScheduled(planned), {
      failure: 'It wasn’t scheduled',
      onDone: () => {
        notify({ message: draft.when === null ? 'Saved' : `Scheduled ${whenLabel(draft.when)}` });
        router.back();
      },
    });
  };
  return {
    draft,
    problem,
    saving: mutation.busy,
    setLabel: (label): void => {
      setDraft({ ...draft, label });
    },
    setWhen: (when): void => {
      setTouched({ ...touched, when: true });
      setDraft({ ...draft, when });
    },
    changeActions: (change): void => {
      setTouched({ ...touched, actions: true });
      setDraft({ ...draft, actions: changeList(draft.actions ?? [], change) });
    },
    save,
  };
}
