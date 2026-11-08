import type { GoogleAccount } from './account';
import { stringField } from './json';
import { apiFailure, noContent, ok, type Reply } from './reply';
import { boolParam, intParam, jsonBody, unsupportedParams, type RequestContext } from './request';
import { TASKS_HOST, authed, decodeGroup, type AuthedRoute, type Route } from './route';
import { TASKS_READ, TASKS_WRITE } from './scopes';
import type { Placement } from './tasks-store';

const DEFAULT_TASKS_PAGE = 20;
const MAX_TASKS_PAGE = 100;
const PAGE_TOKEN = /^fake-tasks:(\d+)$/;
const UNSUPPORTED_TASK_FILTERS = [
  'dueMin',
  'dueMax',
  'completedMin',
  'completedMax',
  'showAssigned',
];

function offsetOf(query: URLSearchParams): number {
  const token = query.get('pageToken');
  if (token === null) return 0;
  const offset = PAGE_TOKEN.exec(token)?.[1];
  if (offset === undefined) throw apiFailure(400, 'Invalid page token.', 'invalid');
  return Number(offset);
}

function nextToken(offset: number | null): Record<string, string> {
  return offset === null ? {} : { nextPageToken: `fake-tasks:${String(offset)}` };
}

function placementOf(query: URLSearchParams): Placement {
  return { parent: query.get('parent'), previous: query.get('previous') };
}

function listTaskLists(context: RequestContext, account: GoogleAccount): Reply {
  const offset = offsetOf(context.query);
  const max = intParam(context.query, 'maxResults', DEFAULT_TASKS_PAGE, MAX_TASKS_PAGE);
  const all = account.tasks.all();
  const items = all.slice(offset, offset + max).map((list) => list.resource());
  const end = offset + items.length;
  return ok({
    kind: 'tasks#taskLists',
    items,
    ...nextToken(end < all.length ? end : null),
  });
}

function createTaskList(context: RequestContext, account: GoogleAccount): Reply {
  const title = stringField(jsonBody(context), 'title');
  if (title === undefined) throw apiFailure(400, 'Invalid value for: title', 'invalid');
  return ok(account.tasks.addList(title).resource());
}

function listTasks(context: RequestContext, account: GoogleAccount): Reply {
  unsupportedParams(context.query, UNSUPPORTED_TASK_FILTERS);
  const list = account.tasks.list(decodeGroup(context, 0));
  const updatedMin = context.query.get('updatedMin');
  const updatedMinMs = updatedMin === null ? null : Date.parse(updatedMin);
  if (updatedMinMs !== null && Number.isNaN(updatedMinMs)) {
    throw apiFailure(400, 'Invalid value for: Invalid format: updatedMin', 'invalid');
  }
  const result = list.list({
    showCompleted: boolParam(context.query, 'showCompleted', true),
    showDeleted: boolParam(context.query, 'showDeleted', false),
    showHidden: boolParam(context.query, 'showHidden', false),
    updatedMinMs,
    maxResults: intParam(context.query, 'maxResults', DEFAULT_TASKS_PAGE, MAX_TASKS_PAGE),
    offset: offsetOf(context.query),
  });
  return ok({
    kind: 'tasks#tasks',
    etag: `"tasks-${list.id}"`,
    ...(result.items.length > 0 ? { items: result.items } : {}),
    ...nextToken(result.nextOffset),
  });
}

function insertTask(context: RequestContext, account: GoogleAccount): Reply {
  const list = account.tasks.list(decodeGroup(context, 0));
  return ok(list.insert(jsonBody(context), placementOf(context.query)));
}

function getTask(context: RequestContext, account: GoogleAccount): Reply {
  return ok(account.tasks.list(decodeGroup(context, 0)).get(decodeGroup(context, 1)));
}

function patchTask(context: RequestContext, account: GoogleAccount): Reply {
  const list = account.tasks.list(decodeGroup(context, 0));
  const ifMatch = context.headers.get('if-match');
  return ok(list.patch(decodeGroup(context, 1), jsonBody(context), ifMatch));
}

function deleteTask(context: RequestContext, account: GoogleAccount): Reply {
  const list = account.tasks.list(decodeGroup(context, 0));
  list.remove(decodeGroup(context, 1), context.headers.get('if-match'));
  return noContent();
}

function moveTask(context: RequestContext, account: GoogleAccount): Reply {
  unsupportedParams(context.query, ['destinationTasklist']);
  const list = account.tasks.list(decodeGroup(context, 0));
  const ifMatch = context.headers.get('if-match');
  return ok(list.move(decodeGroup(context, 1), placementOf(context.query), ifMatch));
}

function clearTasks(context: RequestContext, account: GoogleAccount): Reply {
  account.tasks.list(decodeGroup(context, 0)).clearCompleted();
  return noContent();
}

function route(
  method: string,
  pattern: RegExp,
  auth: readonly string[],
  handle: AuthedRoute['handle'],
): Route {
  return authed({ host: TASKS_HOST, method, pattern, auth, handle });
}

export function tasksRoutes(): readonly Route[] {
  const lists = /^\/tasks\/v1\/users\/@me\/lists$/;
  const tasks = /^\/tasks\/v1\/lists\/([^/]+)\/tasks$/;
  const task = /^\/tasks\/v1\/lists\/([^/]+)\/tasks\/([^/]+)$/;
  const move = /^\/tasks\/v1\/lists\/([^/]+)\/tasks\/([^/]+)\/move$/;
  const clear = /^\/tasks\/v1\/lists\/([^/]+)\/clear$/;
  return [
    route('GET', lists, TASKS_READ, listTaskLists),
    route('POST', lists, TASKS_WRITE, createTaskList),
    route('GET', tasks, TASKS_READ, listTasks),
    route('POST', tasks, TASKS_WRITE, insertTask),
    route('GET', task, TASKS_READ, getTask),
    route('PATCH', task, TASKS_WRITE, patchTask),
    route('DELETE', task, TASKS_WRITE, deleteTask),
    route('POST', move, TASKS_WRITE, moveTask),
    route('POST', clear, TASKS_WRITE, clearTasks),
  ];
}
