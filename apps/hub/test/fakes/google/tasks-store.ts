import type { FakeClock } from './clock';
import { mergePatch, omitFields, stringField, type JsonObject } from './json';
import { apiFailure, checkIfMatch } from './reply';
import { normaliseTask, parentOf, validateTaskText, writableTaskFields } from './task-fields';
import {
  POSITION_STEP,
  comparePositions,
  formatPosition,
  positionBetween,
  positionValue,
} from './task-position';

export interface TasksDeps {
  readonly clock: FakeClock;
  readonly nextServerId: () => number;
  readonly honourIfMatch: boolean;
  readonly updatedMinInclusive: boolean;
}

export interface Placement {
  readonly parent: string | null;
  readonly previous: string | null;
}

export interface TasksQuery {
  readonly showCompleted: boolean;
  readonly showDeleted: boolean;
  readonly showHidden: boolean;
  readonly updatedMinMs: number | null;
  readonly maxResults: number;
  readonly offset: number;
}

export interface TasksPageResult {
  readonly items: readonly JsonObject[];
  readonly nextOffset: number | null;
}

const BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

export class TaskListStore {
  readonly id: string;
  private readonly title: string;
  private readonly updated: string;
  private etagCounter = 0;
  private readonly tasks = new Map<string, JsonObject>();
  private readonly deps: TasksDeps;

  constructor(id: string, title: string, deps: TasksDeps) {
    this.id = id;
    this.title = title;
    this.deps = deps;
    this.updated = deps.clock.iso();
  }

  resource(): JsonObject {
    return {
      kind: 'tasks#taskList',
      id: this.id,
      etag: `"list-${this.id}"`,
      title: this.title,
      updated: this.updated,
      selfLink: `${BASE_URL}/users/@me/lists/${this.id}`,
    };
  }

  insert(body: JsonObject, placement: Placement): JsonObject {
    const fields = writableTaskFields(body);
    validateTaskText(fields);
    this.requireParent(placement.parent, null);
    const id = `task-${String(this.deps.nextServerId())}`;
    const position = this.position(null, placement);
    const stamp = this.stamp();
    const created = normaliseTask(
      {
        kind: 'tasks#task',
        id,
        title: '',
        status: 'needsAction',
        links: [],
        selfLink: `${BASE_URL}/lists/${this.id}/tasks/${id}`,
        ...fields,
        position,
        ...(placement.parent === null ? {} : { parent: placement.parent }),
      },
      stamp.updated,
    );
    this.tasks.set(id, { ...created, ...stamp });
    return this.view(id);
  }

  get(id: string): JsonObject {
    this.active(id);
    return this.view(id);
  }

  patch(id: string, body: JsonObject, ifMatch: string | null): JsonObject {
    const current = this.active(id);
    this.precondition(current, ifMatch);
    const fields = writableTaskFields(body);
    validateTaskText(fields);
    const stamp = this.stamp();
    const merged = normaliseTask(mergePatch(current, fields), stamp.updated);
    this.tasks.set(id, { ...merged, ...stamp });
    return this.view(id);
  }

  remove(id: string, ifMatch: string | null): void {
    const current = this.active(id);
    this.precondition(current, ifMatch);
    for (const child of this.siblings(id, false)) this.markDeleted(stringField(child, 'id') ?? '');
    this.markDeleted(id);
  }

  move(id: string, placement: Placement, ifMatch: string | null): JsonObject {
    const current = this.active(id);
    this.precondition(current, ifMatch);
    this.requireParent(placement.parent, id);
    const position = this.position(id, placement);
    const stamp = this.stamp();
    this.tasks.set(id, {
      ...omitFields(this.requireTask(id), ['parent']),
      position,
      ...(placement.parent === null ? {} : { parent: placement.parent }),
      ...stamp,
    });
    return this.view(id);
  }

  clearCompleted(): void {
    for (const task of [...this.tasks.values()]) {
      const id = stringField(task, 'id') ?? '';
      const visible = task['deleted'] !== true && task['hidden'] !== true;
      if (visible && task['status'] === 'completed') {
        this.tasks.set(id, { ...task, hidden: true, ...this.stamp() });
      }
    }
  }

  list(query: TasksQuery): TasksPageResult {
    const matching = this.ordered().filter((task) => this.included(task, query));
    const items = matching.slice(query.offset, query.offset + query.maxResults);
    const end = query.offset + items.length;
    return {
      items: items.map((task) => structuredClone(task)),
      nextOffset: end < matching.length ? end : null,
    };
  }

  snapshot(): readonly JsonObject[] {
    return [...this.tasks.values()].map((task) => structuredClone(task));
  }

  private included(task: JsonObject, query: TasksQuery): boolean {
    if (task['deleted'] === true && !query.showDeleted) return false;
    if (task['hidden'] === true && !query.showHidden) return false;
    if (task['status'] === 'completed' && !query.showCompleted) return false;
    if (query.updatedMinMs === null) return true;
    const updated = Date.parse(stringField(task, 'updated') ?? '');
    return this.deps.updatedMinInclusive
      ? updated >= query.updatedMinMs
      : updated > query.updatedMinMs;
  }

  private precondition(task: JsonObject, ifMatch: string | null): void {
    if (this.deps.honourIfMatch) checkIfMatch(stringField(task, 'etag') ?? '', ifMatch);
  }

  private stamp(): { etag: string; updated: string } {
    this.deps.clock.tick();
    this.etagCounter += 1;
    return { etag: `"${this.id}-${String(this.etagCounter)}"`, updated: this.deps.clock.iso() };
  }

  private view(id: string): JsonObject {
    return structuredClone(this.requireTask(id));
  }

  private requireTask(id: string): JsonObject {
    const task = this.tasks.get(id);
    if (task === undefined) throw apiFailure(404, 'Not Found', 'notFound');
    return task;
  }

  private active(id: string): JsonObject {
    const task = this.requireTask(id);
    if (task['deleted'] === true) throw apiFailure(404, 'Not Found', 'notFound');
    return task;
  }

  private markDeleted(id: string): void {
    this.tasks.set(id, { ...this.requireTask(id), deleted: true, ...this.stamp() });
  }

  private requireParent(parent: string | null, moving: string | null): void {
    if (parent === null) return;
    const task = this.tasks.get(parent);
    const invalid =
      task === undefined ||
      task['deleted'] === true ||
      parent === moving ||
      this.isInside(parent, moving);
    if (invalid) throw apiFailure(400, 'Invalid value for: parent', 'invalid');
  }

  private isInside(candidate: string, ancestor: string | null): boolean {
    let cursor = this.tasks.get(candidate);
    while (cursor !== undefined && ancestor !== null) {
      const parent = parentOf(cursor);
      if (parent === ancestor) return true;
      cursor = parent === null ? undefined : this.tasks.get(parent);
    }
    return false;
  }

  private siblings(parent: string | null, includeDeleted: boolean): JsonObject[] {
    return [...this.tasks.values()]
      .filter((task) => parentOf(task) === parent && (includeDeleted || task['deleted'] !== true))
      .sort((a, b) =>
        comparePositions(stringField(a, 'position') ?? '', stringField(b, 'position') ?? ''),
      );
  }

  private ordered(): JsonObject[] {
    return this.siblings(null, true).flatMap((top) => [
      top,
      ...this.siblings(stringField(top, 'id') ?? null, true),
    ]);
  }

  private position(moving: string | null, placement: Placement): string {
    const siblings = this.siblings(placement.parent, false).filter(
      (task) => stringField(task, 'id') !== moving,
    );
    const slot = this.slot(siblings, placement.previous);
    const placed = positionBetween(slot.lower, slot.upper);
    if (placed !== null) return formatPosition(placed);
    this.renumber(siblings);
    return this.position(moving, placement);
  }

  private slot(
    siblings: readonly JsonObject[],
    previous: string | null,
  ): { lower: bigint | null; upper: bigint | null } {
    const valueAt = (index: number): bigint | null => {
      const task = siblings[index];
      return task === undefined ? null : positionValue(stringField(task, 'position') ?? '0');
    };
    if (previous === null) return { lower: null, upper: valueAt(0) };
    const index = siblings.findIndex((task) => stringField(task, 'id') === previous);
    if (index < 0) throw apiFailure(400, 'Invalid value for: previous', 'invalid');
    return { lower: valueAt(index), upper: valueAt(index + 1) };
  }

  private renumber(siblings: readonly JsonObject[]): void {
    siblings.forEach((task, index) => {
      const id = stringField(task, 'id') ?? '';
      const position = formatPosition(POSITION_STEP * BigInt(index + 1));
      this.tasks.set(id, { ...task, position, ...this.stamp() });
    });
  }
}
