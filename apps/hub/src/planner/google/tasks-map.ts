import type { PlannerAttachment, PlannerItemGoogle, PlannerItemRow } from '@smarteverything/domain';
import { buildFieldPatch, type FieldMap, type GoogleTask } from '@smarteverything/google';
import type { PlannerItemInput } from '../../store/repositories/planner-items';

export const TASK_FIELDS = ['title', 'notes', 'status', 'due', 'parent'] as const;

export const PATCH_FIELDS = TASK_FIELDS.filter((name) => name !== 'parent');

export function untitled(title: string): string {
  return title.trim() === '' ? 'Untitled task' : title;
}

const MIDNIGHT = 'T00:00:00.000Z';

function describeAttachment(attachment: PlannerAttachment): string {
  switch (attachment.kind) {
    case 'link':
      return attachment.title === null ? attachment.url : `${attachment.title} ${attachment.url}`;
    case 'device':
      return 'a device';
    case 'scene':
      return 'a scene';
    case 'automation':
      return 'an automation';
    case 'file':
      return 'a file';
  }
}

export function extrasLine(item: Pick<PlannerItemRow, 'rrule' | 'attachments'>): string | null {
  const parts: string[] = [];
  if (item.rrule !== null) parts.push(`Repeats ${item.rrule}`);
  if (item.attachments.length > 0) {
    parts.push(`Attached ${item.attachments.map(describeAttachment).join(', ')}`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

export function pushedNotes(
  item: Pick<PlannerItemRow, 'notes' | 'rrule' | 'attachments'>,
): string | undefined {
  const line = extrasLine(item);
  const text = line === null ? item.notes : item.notes === '' ? line : `${item.notes}\n${line}`;
  return text === '' ? undefined : text;
}

export function localNotes(
  remote: string | undefined,
  item: Pick<PlannerItemRow, 'rrule' | 'attachments'>,
): string {
  if (remote === undefined) return '';
  const line = extrasLine(item);
  if (line === null) return remote;
  if (remote === line) return '';
  return remote.endsWith(`\n${line}`) ? remote.slice(0, -line.length - 1) : remote;
}

export function dueDate(due: string | undefined): string | undefined {
  return due === undefined ? undefined : due.slice(0, 10);
}

export function itemFields(item: PlannerItemRow, parentGoogleId: string | undefined): FieldMap {
  return {
    title: item.title,
    notes: pushedNotes(item),
    status: item.status === 'done' ? 'completed' : 'needsAction',
    due: item.due_date ?? undefined,
    parent: parentGoogleId,
  };
}

export function taskFields(task: GoogleTask): FieldMap {
  return {
    title: task.title ?? '',
    notes: task.notes === undefined || task.notes === '' ? undefined : task.notes,
    status: task.status,
    due: dueDate(task.due),
    parent: task.parent,
  };
}

export function googleOrder(position: string | undefined): number {
  return position === undefined ? 0 : Number(position);
}

export interface TaskBase {
  readonly fields: FieldMap;
  readonly position: number;
  readonly sentAt: string | null;
}

export function baseOf(base: TaskBase): PlannerItemGoogle['base'] {
  const entries: Record<string, string | number | null> = {
    position: base.position,
    sentAt: base.sentAt,
  };
  for (const name of TASK_FIELDS) {
    const value = base.fields[name];
    if (typeof value === 'string') entries[name] = value;
  }
  return entries;
}

export function baseFields(base: PlannerItemGoogle['base']): FieldMap {
  const fields: Record<string, unknown> = {};
  for (const name of TASK_FIELDS) {
    const value = base[name];
    if (value !== undefined) fields[name] = value;
  }
  return fields;
}

export function basePosition(base: PlannerItemGoogle['base']): number | null {
  const value = base['position'];
  return typeof value === 'number' ? value : null;
}

export function baseSentAt(base: PlannerItemGoogle['base']): string | null {
  const value = base['sentAt'];
  return typeof value === 'string' ? value : null;
}

export function importedTask(
  task: GoogleTask,
  profileId: string,
  collectionId: string,
  listId: string,
): PlannerItemInput {
  const fields = taskFields(task);
  const due = dueDate(task.due) ?? null;
  const position = googleOrder(task.position);
  return {
    profile_id: profileId,
    collection_id: collectionId,
    kind: 'task',
    parent_id: null,
    title: untitled(task.title ?? ''),
    notes: task.notes ?? '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: null,
    end_local: null,
    time_zone: null,
    all_day: false,
    due_date: due,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: null,
    end: null,
    series_end: null,
    status: task.status === 'completed' ? 'done' : 'open',
    position,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: {
      id: task.id,
      calendarOrListId: listId,
      etag: task.etag,
      base: baseOf({ fields, position, sentAt: null }),
      state: 'synced',
    },
    created_by: 'google',
  };
}

export interface RequestBody {
  readonly body: Record<string, unknown>;
  readonly headers: Readonly<Record<string, string>>;
}

export function requestBody(
  fields: FieldMap,
  base: FieldMap,
  names: readonly string[],
  etag: string,
): RequestBody | null {
  const patch = buildFieldPatch({ etag, base, next: fields, fields: names });
  if (patch === null) return null;
  const body: Record<string, unknown> = { ...patch.body };
  if (typeof body['due'] === 'string') body['due'] = `${body['due']}${MIDNIGHT}`;
  if (body['status'] === 'needsAction') body['completed'] = null;
  return { body, headers: patch.headers };
}

export function insertBody(fields: FieldMap): Record<string, unknown> {
  const body: Record<string, unknown> = { title: fields['title'], status: fields['status'] };
  if (typeof fields['notes'] === 'string') body['notes'] = fields['notes'];
  if (typeof fields['due'] === 'string') body['due'] = `${fields['due']}${MIDNIGHT}`;
  return body;
}

export function localDuePatch(
  item: Pick<PlannerItemRow, 'due_date' | 'due_at'>,
  due: string | undefined,
): { readonly due_date: string | null; readonly due_at: string | null } {
  const next = due ?? null;
  return { due_date: next, due_at: next === item.due_date ? item.due_at : null };
}
