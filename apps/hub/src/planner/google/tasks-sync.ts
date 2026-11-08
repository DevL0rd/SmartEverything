import {
  type GoogleSyncCounts,
  type GoogleSyncTrigger,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { applyTasksPage, type GoogleTask, type TasksSyncState } from '@smarteverything/google';
import { Logger } from '@smarteverything/logging';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import type { GoogleSyncLogRepository } from '../../store/repositories/google-sync-log';
import type { GoogleSyncStateRepository } from '../../store/repositories/google-sync-state';
import type { PlannerCollectionsRepository } from '../../store/repositories/planner-collections';
import type { PlannerItemsRepository } from '../../store/repositories/planner-items';
import { Run, TasksLocal, type Scope } from './tasks-local';
import { baseSentAt, untitled } from './tasks-map';
import { TasksPush } from './tasks-push';
import { TasksWire } from './tasks-wire';

const log = new Logger('hub.googletasks');

export interface TasksSyncDeps {
  readonly fetch: FetchLike;
  readonly accessToken: (profileId: string) => Promise<string>;
  readonly items: PlannerItemsRepository;
  readonly collections: PlannerCollectionsRepository;
  readonly states: GoogleSyncStateRepository;
  readonly log: GoogleSyncLogRepository;
  readonly now: () => string;
}

export class TasksSync {
  private readonly wire: TasksWire;
  private readonly local: TasksLocal;
  private readonly pusher: TasksPush;

  constructor(private readonly deps: TasksSyncDeps) {
    this.wire = new TasksWire(deps.fetch, deps.accessToken);
    this.local = new TasksLocal(deps.items);
    this.pusher = new TasksPush(deps.items, this.wire, this.local, deps.now);
  }

  async sync(profileId: string, trigger: GoogleSyncTrigger): Promise<GoogleSyncCounts> {
    const run = new Run(profileId);
    try {
      await this.discoverLists(profileId);
      for (const scope of this.scopes(run)) {
        await this.pull(scope);
        await this.pusher.push(scope);
      }
    } catch (cause) {
      this.record(run, trigger, cause instanceof Error ? cause.message : 'unknown');
      throw cause;
    }
    this.record(run, trigger, null);
    return run.counts;
  }

  async resolveChoice(profileId: string, logId: string, googleId: string): Promise<void> {
    const { choice } = this.deps.log.byId(logId, profileId);
    if (choice === null) return;
    if (choice.resolved_google_id !== null) return;
    const run = new Run(profileId);
    const scope = this.scopes(run).find((candidate) => candidate.listId === choice.list_id);
    if (scope === undefined) return;
    const item = this.deps.items.byId(choice.item_id, profileId);
    for (const candidate of choice.candidates) {
      const task = await this.wire.task(scope, candidate.google_id);
      if (candidate.google_id !== googleId) {
        this.local.importTask(scope, task);
        continue;
      }
      this.local.adopt(scope, item, task);
      this.local.mergeIn(scope, this.deps.items.byId(item.id, profileId), task);
    }
    this.local.applyParents(scope);
    this.deps.log.replaceChoice(logId, profileId, {
      ...choice,
      resolved_google_id: googleId,
      resolved_at: this.deps.now(),
    });
  }

  private record(run: Run, trigger: GoogleSyncTrigger, error: string | null): void {
    run.finish();
    this.deps.log.insert({
      profile_id: run.profileId,
      trigger,
      product: 'tasks',
      counts: run.counts,
      conflicts: run.conflicts,
      error,
      choice: null,
    });
    log.info('google.tasks.synced', { profileId: run.profileId, ...run.counts, error });
  }

  private scopes(run: Run): Scope[] {
    return this.deps.collections
      .list(run.profileId)
      .flatMap((collection) =>
        collection.kind === 'list' && collection.google !== null
          ? [{ run, profileId: run.profileId, collection, listId: collection.google.id }]
          : [],
      );
  }

  private async discoverLists(profileId: string): Promise<void> {
    const { collections } = this.deps;
    for (const remote of await this.wire.lists(profileId)) {
      const existing = collections.byGoogle(profileId, remote.id);
      const name = untitled(remote.title);
      const google = {
        id: remote.id,
        etag: remote.etag ?? null,
        syncToken: existing?.google?.syncToken ?? null,
      };
      if (existing !== undefined) {
        collections.update(existing.id, profileId, { google, name });
        continue;
      }
      collections.insert({
        profile_id: profileId,
        kind: 'list',
        name,
        colour: 'personal',
        icon: 'list',
        position: collections.list(profileId).length,
        visible: true,
        default_reminders: [],
        source: 'google',
        google,
      });
    }
  }

  private async pull(scope: Scope): Promise<void> {
    const resource = {
      profileId: scope.profileId,
      product: 'tasks',
      resourceId: scope.listId,
    } as const;
    const stored = this.deps.states.find(resource);
    const { upserts, tombstones, state } = await this.pages(scope, stored?.sync_token ?? null);
    scope.run.count('pulled', upserts.length + tombstones.length);
    for (const task of this.adoptSending(scope, upserts)) this.apply(scope, task);
    for (const id of tombstones) this.local.removeLocal(scope, id);
    this.local.applyParents(scope);
    this.deps.states.put({
      profile_id: scope.profileId,
      product: 'tasks',
      resource_id: scope.listId,
      sync_token: state.updatedMin,
      channel: stored?.channel ?? null,
      last_pull_at: this.deps.now(),
    });
  }

  private async pages(
    scope: Scope,
    updatedMin: string | null,
  ): Promise<{
    readonly upserts: GoogleTask[];
    readonly tombstones: string[];
    readonly state: TasksSyncState;
  }> {
    const known = this.local.known(scope);
    const upserts: GoogleTask[] = [];
    const tombstones: string[] = [];
    let state: TasksSyncState = { updatedMin, pageToken: null, highWater: null };
    for (;;) {
      const page = await this.wire.page(scope, {
        updatedMin: state.updatedMin ?? undefined,
        pageToken: state.pageToken ?? undefined,
      });
      const result = applyTasksPage(state, page, known);
      upserts.push(...result.upserts);
      tombstones.push(...result.tombstones);
      state = result.state;
      if (result.complete) return { upserts, tombstones, state };
    }
  }

  private adoptSending(scope: Scope, upserts: readonly GoogleTask[]): GoogleTask[] {
    const { items } = this.deps;
    const held = this.heldByChoices(scope);
    const unmapped = (task: GoogleTask): boolean =>
      items.byGoogle(scope.profileId, scope.listId, task.id).length === 0;
    const sending = this.local
      .tasks(scope)
      .filter((row) => row.google?.state === 'sending' && row.google.id === null);
    for (const item of sending) {
      if (this.hasOpenChoice(scope, item)) continue;
      const sentAt = Date.parse(baseSentAt(item.google?.base ?? {}) ?? '');
      const matches = upserts.filter(
        (task) =>
          !held.has(task.id) &&
          task.title === item.title &&
          Date.parse(task.updated) >= sentAt &&
          unmapped(task),
      );
      const [only] = matches;
      if (only !== undefined && matches.length === 1) {
        this.local.adopt(scope, item, only);
      } else if (matches.length === 0) {
        items.update(item.id, scope.profileId, { google: null });
      } else {
        for (const task of matches) held.add(task.id);
        this.askChoice(scope, item, matches);
      }
    }
    return upserts.filter((task) => !held.has(task.id));
  }

  private heldByChoices(scope: Scope): Set<string> {
    const held = new Set<string>();
    for (const entry of this.deps.log.list(scope.profileId)) {
      const choice = entry.choice;
      if (choice?.list_id !== scope.listId || choice.resolved_google_id !== null) continue;
      for (const candidate of choice.candidates) held.add(candidate.google_id);
    }
    return held;
  }

  private hasOpenChoice(scope: Scope, item: PlannerItemRow): boolean {
    return this.deps.log
      .list(scope.profileId)
      .some((e) => e.choice?.item_id === item.id && e.choice.resolved_google_id === null);
  }

  private askChoice(scope: Scope, item: PlannerItemRow, tasks: readonly GoogleTask[]): void {
    if (this.hasOpenChoice(scope, item)) return;
    const counts = {
      pulled: tasks.length,
      created: 0,
      updated: 0,
      deleted: 0,
      pushed: 0,
      conflicts: 0,
    };
    this.deps.log.insert({
      profile_id: scope.profileId,
      trigger: 'reconcile',
      product: 'tasks',
      counts,
      conflicts: [],
      error: null,
      choice: {
        item_id: item.id,
        list_id: scope.listId,
        candidates: tasks.map((task) => ({
          google_id: task.id,
          title: task.title ?? '',
          created_at: new Date(task.updated).toISOString(),
        })),
        resolved_google_id: null,
        resolved_at: null,
      },
    });
  }

  private apply(scope: Scope, task: GoogleTask): void {
    const [row] = this.deps.items.byGoogle(scope.profileId, scope.listId, task.id);
    if (row === undefined) {
      this.local.importTask(scope, task);
      scope.run.count('created');
    } else if (row.deleted_at === null) {
      this.local.mergeIn(scope, row, task);
    }
  }
}
