import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import { usePlannerWrites } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { PRIORITY_RING, priorityOf } from './priority-flag';
import type { TaskEntry } from './task-grouping';

export interface TaskActions {
  readonly done: (() => void) | null;
  readonly skip: (() => void) | null;
  readonly reopen: (() => void) | null;
}

const NO_ACTIONS: TaskActions = { done: null, skip: null, reopen: null };

export function useTaskActions(entry: TaskEntry): TaskActions {
  const { person, offline } = usePlannerFrame();
  const writes = usePlannerWrites(person);
  const key = entry.occurrenceKey;
  if (offline || key === null) return NO_ACTIONS;
  const run = (failure: string, work: () => Promise<unknown>) => (): void => {
    background(
      work().catch((error: unknown) => {
        notify({ message: failure, error, tone: 'critical' });
      }),
      'planner.task_row_failed',
    );
  };
  const reopen = run('Couldn’t reopen that', () => writes.reopenItem(entry.item, key));
  if (!entry.open) return { done: null, skip: null, reopen: entry.done ? reopen : null };
  return {
    done: run('Couldn’t mark that done', async () => {
      await writes.completeItem(entry.item.id, { occurrence_key: key });
      notify({ message: `Done: ${entry.item.title}`, undo: reopen });
    }),
    skip: run('Couldn’t skip that', () => writes.skipItem(entry.item.id, key)),
    reopen: null,
  };
}

export function TaskCheck({
  entry,
  actions,
}: {
  readonly entry: TaskEntry;
  readonly actions: TaskActions;
}): ReactNode {
  const priority = priorityOf(entry.item.priority);
  const toggle = entry.done ? actions.reopen : actions.done;
  return (
    <Interactive
      role="checkbox"
      checked={entry.done}
      label={`Done: ${entry.item.title}`}
      disabled={toggle === null}
      onPress={() => {
        selectionTick();
        toggle?.();
      }}
      className={cn(
        '-m-2 size-11 items-center justify-center rounded-md',
        entry.done && 'opacity-100',
      )}
      layerClassName="rounded-md"
      focusInset
    >
      <View
        className={cn(
          'size-5 items-center justify-center rounded-xs border-2',
          entry.done && 'border-primary bg-primary',
          !entry.done &&
            (priority === null ? 'border-on-surface-variant' : PRIORITY_RING[priority]),
        )}
      >
        {entry.done ? <Icon name="check" size={16} tone="onPrimary" /> : null}
      </View>
    </Interactive>
  );
}
