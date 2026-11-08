import { stringField, type JsonObject } from './json';
import { apiFailure } from './reply';

export const MAX_TASK_TITLE = 1024;
export const MAX_TASK_NOTES = 8192;

const WRITABLE = ['title', 'notes', 'status', 'due', 'completed'] as const;
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

export function writableTaskFields(body: JsonObject): JsonObject {
  const picked: JsonObject = {};
  for (const name of WRITABLE) {
    const value = body[name];
    if (value !== undefined) picked[name] = value;
  }
  return picked;
}

export function validateTaskText(fields: JsonObject): void {
  const title = fields['title'];
  const notes = fields['notes'];
  if (typeof title === 'string' && title.length > MAX_TASK_TITLE) {
    throw apiFailure(400, 'Invalid value for: title is too long', 'invalid');
  }
  if (typeof notes === 'string' && notes.length > MAX_TASK_NOTES) {
    throw apiFailure(400, 'Invalid value for: notes is too long', 'invalid');
  }
}

function dueDateOnly(due: string): string {
  const day = DATE_PREFIX.exec(due)?.[0];
  if (day === undefined || Number.isNaN(Date.parse(day))) {
    throw apiFailure(400, 'Invalid value for: Invalid format', 'invalid');
  }
  return `${day}T00:00:00.000Z`;
}

export function normaliseTask(resource: JsonObject, nowIso: string): JsonObject {
  const next: JsonObject = { ...resource };
  const due = stringField(next, 'due');
  if (due !== undefined) next['due'] = dueDateOnly(due);
  const status = stringField(next, 'status') ?? 'needsAction';
  if (status !== 'needsAction' && status !== 'completed') {
    throw apiFailure(400, 'Invalid value for: status', 'invalid');
  }
  next['status'] = status;
  if (status === 'needsAction') {
    delete next['completed'];
    delete next['hidden'];
  } else if (stringField(next, 'completed') === undefined) {
    next['completed'] = nowIso;
  }
  return next;
}

export function parentOf(task: JsonObject): string | null {
  return stringField(task, 'parent') ?? null;
}
