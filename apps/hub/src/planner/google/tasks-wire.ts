import {
  GoogleTaskSchema,
  TaskListsPageSchema,
  TasksPageSchema,
  classifyApiFailure,
  taskInsertPath,
  taskListsQuery,
  taskMoveQuery,
  taskPath,
  tasksListQuery,
  type GoogleFailure,
  type GoogleTask,
  type TaskList,
  type TasksListRequest,
  type TasksPage,
} from '@smarteverything/google';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import type { RequestBody } from './tasks-map';

export class GoogleApiError extends Error {
  override readonly name = 'GoogleApiError';

  constructor(readonly failure: GoogleFailure) {
    super(`Google Tasks answered ${failure.kind}.`);
  }
}

export interface TaskTarget {
  readonly profileId: string;
  readonly listId: string;
}

export interface TaskPlacement {
  readonly parent?: string;
  readonly previous?: string;
}

export class TasksWire {
  constructor(
    private readonly send: FetchLike,
    private readonly accessToken: (profileId: string) => Promise<string>,
  ) {}

  async lists(profileId: string): Promise<readonly TaskList[]> {
    const lists: TaskList[] = [];
    let pageToken: string | undefined;
    do {
      const page = TaskListsPageSchema.parse(
        await this.call(profileId, 'GET', taskListsQuery({ pageToken })),
      );
      lists.push(...page.items);
      pageToken = page.nextPageToken;
    } while (pageToken !== undefined);
    return lists;
  }

  async page(
    target: TaskTarget,
    request: Omit<TasksListRequest, 'taskListId'>,
  ): Promise<TasksPage> {
    const url = tasksListQuery({ ...request, taskListId: target.listId });
    return TasksPageSchema.parse(await this.call(target.profileId, 'GET', url));
  }

  async task(target: TaskTarget, id: string): Promise<GoogleTask> {
    const json = await this.call(target.profileId, 'GET', taskPath(target.listId, id));
    return GoogleTaskSchema.parse(json);
  }

  async insert(
    target: TaskTarget,
    placement: TaskPlacement,
    body: Record<string, unknown>,
  ): Promise<GoogleTask> {
    const query = new URLSearchParams();
    if (placement.parent !== undefined) query.set('parent', placement.parent);
    if (placement.previous !== undefined) query.set('previous', placement.previous);
    const url = taskInsertPath(target.listId);
    const text = query.toString();
    const json = await this.call(target.profileId, 'POST', text === '' ? url : `${url}?${text}`, {
      body,
    });
    return GoogleTaskSchema.parse(json);
  }

  async patch(target: TaskTarget, id: string, request: RequestBody): Promise<GoogleTask> {
    const json = await this.call(target.profileId, 'PATCH', taskPath(target.listId, id), request);
    return GoogleTaskSchema.parse(json);
  }

  async move(
    target: TaskTarget,
    id: string,
    placement: TaskPlacement,
    etag: string,
  ): Promise<GoogleTask> {
    const url = taskMoveQuery(target.listId, id, placement);
    const json = await this.call(target.profileId, 'POST', url, { headers: { 'If-Match': etag } });
    return GoogleTaskSchema.parse(json);
  }

  async remove(target: TaskTarget, id: string, etag: string): Promise<void> {
    await this.call(target.profileId, 'DELETE', taskPath(target.listId, id), {
      headers: { 'If-Match': etag },
    });
  }

  private async call(
    profileId: string,
    method: string,
    url: string,
    request: Partial<RequestBody> = {},
  ): Promise<unknown> {
    const token = await this.accessToken(profileId);
    const response = await this.send(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...request.headers,
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    const text = await response.text();
    const json: unknown = text === '' ? null : JSON.parse(text);
    if (!response.ok) throw new GoogleApiError(classifyApiFailure(response.status, json));
    return json;
  }
}
