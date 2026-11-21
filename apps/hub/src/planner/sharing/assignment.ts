import {
  ApiError,
  PLANNER_ASSIGNED_NOTICE,
  PLANNER_SIGNAL,
  PLANNER_SIGNAL_SOURCE,
  type LiveChange,
  type PlannerItemRow,
  type SignalInput,
} from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';
import type { Store } from '../../store/store';

export interface AssignmentOptions {
  readonly store: Pick<Store, 'feed' | 'host'>;
  readonly now: () => Date;
  readonly emit: (signal: SignalInput) => void;
}

export function requireAssignee(
  store: Pick<HostStore, 'profiles' | 'personAccess'>,
  kind: PlannerItemRow['kind'],
  assigneeId: string | null,
): void {
  if (assigneeId === null) return;
  if (kind !== 'task') {
    throw new ApiError('invalid_request', 'Only a task can be assigned; an event has guests.');
  }
  const person = store.profiles.byId(assigneeId);
  const areas = store.personAccess.scopes(person.id)?.areas ?? [];
  if (!areas.includes('planner')) {
    throw new ApiError('invalid_request', `${person.name} has no access to the Planner.`);
  }
}

function assignerOf(item: PlannerItemRow): string | null {
  return item.assignee_id === item.profile_id ? null : item.profile_id;
}

function notify(
  options: AssignmentOptions,
  item: PlannerItemRow,
  assigneeId: string,
  state: 'assigned' | 'done',
): void {
  const assignerId = assignerOf(item);
  if (assignerId === null) return;
  options.store.feed.notice(
    PLANNER_ASSIGNED_NOTICE.parse({
      type: 'planner_assigned',
      personId: state === 'assigned' ? assigneeId : assignerId,
      itemId: item.id,
      title: item.title,
      state,
      assignerId,
      assigneeId,
    }),
  );
}

function announce(options: AssignmentOptions, item: PlannerItemRow, assigneeId: string): void {
  options.emit(
    PLANNER_SIGNAL.parse({
      source: PLANNER_SIGNAL_SOURCE,
      kind: 'task_assigned',
      subject: item.id,
      field: null,
      value: assigneeId,
      previous: null,
      at: options.now().toISOString(),
      profileId: assigneeId,
      data: {
        itemId: item.id,
        title: item.title,
        assigneeId,
        assignerId: assignerOf(item),
      },
    }),
  );
}

function followItem(
  options: AssignmentOptions,
  change: LiveChange & { table: 'planner_items' },
): void {
  const { record, oldRecord } = change;
  if (record === null) return;
  const assigneeId = record.assignee_id;
  if (assigneeId === null) return;
  if (oldRecord?.assignee_id !== assigneeId) {
    announce(options, record, assigneeId);
    notify(options, record, assigneeId, 'assigned');
  } else if (record.status === 'done' && oldRecord.status !== 'done') {
    notify(options, record, assigneeId, 'done');
  }
}

async function followOccurrence(
  options: AssignmentOptions,
  change: LiveChange & { table: 'planner_occurrences' },
): Promise<void> {
  const { record, oldRecord } = change;
  if (record?.status !== 'done' || oldRecord?.status === 'done') return;
  const item = await options.store.host.call('plannerItems', 'findAny', record.item_id);
  const rule = item?.rrule ?? null;
  if (item === undefined || rule === null) return;
  const assigneeId = item.assignee_id;
  if (assigneeId !== null) notify(options, item, assigneeId, 'done');
}

export async function followAssignment(
  options: AssignmentOptions,
  change: LiveChange,
): Promise<void> {
  if (change.table === 'planner_items') followItem(options, change);
  else if (change.table === 'planner_occurrences') await followOccurrence(options, change);
}
