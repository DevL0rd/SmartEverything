import {
  type GoogleSyncCounts,
  type GoogleSyncTrigger,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { applyTasksPage, type GoogleTask, type TasksSyncState } from '@smarteverything/google';
import { Logger } from '@smarteverything/logging';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import type { HostedRepository } from '../../store/host/hosted';
import { Run, TasksLocal, type Scope, type TaskItems } from './tasks-local';
import { baseSentAt, untitled } from './tasks-map';
import { TasksPush } from './tasks-push';
import { TasksWire } from './tasks-wire';

const log = new Logger('hub.googletasks');

export interface TasksSyncDeps {
  readonly fetch: FetchLike;
  readonly accessToken: (profileId: string) => Promise<string>;
  readonly items: TaskItems;
  readonly collections: HostedRepository<
    'plannerCollections',
    'list' | 'byGoogle' | 'update' | 'insert'
  >;
  readonly states: HostedRepository<'googleSyncState', 'find' | 'put'>;
  readonly log: HostedRepository<'googleSyncLog', 'byId' | 'replaceChoice' | 'insert' | 'list'>;
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
      for (const scope of await this.scopes(run)) {
        await this.pull(scope);
        await this.pusher.push(scope);
      }
    } catch (cause) {
      await this.record(run, trigger, cause instanceof Error ? cause.message : 'unknown');
      throw cause;
    }
    await this.record(run, trigger, null);
    return run.counts;
  }

  async resolveChoice(profileId: string, logId: string, googleId: string): Promise<void> {
    const { choice } = await this.deps.log.byId(logId, profileId);
    if (choice === null) return;
    if (choice.resolved_google_id !== null) return;
    const run = new Run(profileId);
    const scope = (await this.scopes(run)).find((candidate) => candidate.listId === choice.list_id);
    if (scope === undefined) return;
    const item = await this.deps.items.byId(choice.item_id, profileId);
    for (const candidate of choice.candidates) {
      const task = await this.wire.task(scope, candidate.google_id);
      if (candidate.google_id !== googleId) {
        await this.local.importTask(scope, task);
        continue;
      }
      await this.local.adopt(scope, item, task);
      await this.local.mergeIn(scope, await this.deps.items.byId(item.id, profileId), task);
    }
    await this.local.applyParents(scope);
    await this.deps.log.replaceChoice(logId, profileId, {
      ...choice,
      resolved_google_id: googleId,
      resolved_at: this.deps.now(),
    });
  }

  private async record(run: Run, trigger: GoogleSyncTrigger, error: string | null): Promise<void> {
    run.finish();
    await this.deps.log.insert({
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

  private async scopes(run: Run): Promise<Scope[]> {
    return (await this.deps.collections.list(run.profileId)).flatMap((collection) =>
      collection.kind === 'list' && collection.google !== null
        ? [{ run, profileId: run.profileId, collection, listId: collection.google.id }]
        : [],
    );
  }

  private async discoverLists(profileId: string): Promise<void> {
    const { collections } = this.deps;
    for (const remote of await this.wire.lists(profileId)) {
      const existing = await collections.byGoogle(profileId, remote.id);
      const name = untitled(remote.title);
      const google = {
        id: remote.id,
        etag: remote.etag ?? null,
        syncToken: existing?.google?.syncToken ?? null,
      };
      if (existing !== undefined) {
        await collections.update(existing.id, profileId, { google, name });
        continue;
      }
      await collections.insert({
        profile_id: profileId,
        kind: 'list',
        name,
        colour: 'personal',
        icon: 'list',
        position: (await collections.list(profileId)).length,
        visible: true,
        default_reminders: [],
        audience: 'personal',
        source: 'google',
        google,
        feed: null,
      });
    }
  }

  private async pull(scope: Scope): Promise<void> {
    const resource = {
      profileId: scope.profileId,
      product: 'tasks',
      resourceId: scope.listId,
    } as const;
    const stored = await this.deps.states.find(resource);
    const { upserts, tombstones, state } = await this.pages(scope, stored?.sync_token ?? null);
    scope.run.count('pulled', upserts.length + tombstones.length);
    for (const task of await this.adoptSending(scope, upserts)) await this.apply(scope, task);
    for (const id of tombstones) await this.local.removeLocal(scope, id);
    await this.local.applyParents(scope);
    await this.deps.states.put({
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
    const known = await this.local.known(scope);
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

  private async adoptSending(scope: Scope, upserts: readonly GoogleTask[]): Promise<GoogleTask[]> {
    const { items } = this.deps;
    const held = await this.heldByChoices(scope);
    const mapped = await this.mappedOf(scope, upserts);
    const sending = (await this.local.tasks(scope)).filter(
      (row) => row.google?.state === 'sending' && row.google.id === null,
    );
    for (const item of sending) {
      if (await this.hasOpenChoice(scope, item)) continue;
      const sentAt = Date.parse(baseSentAt(item.google?.base ?? {}) ?? '');
      const matches = upserts.filter(
        (task) =>
          !held.has(task.id) &&
          task.title === item.title &&
          Date.parse(task.updated) >= sentAt &&
          !mapped.has(task.id),
      );
      const [only] = matches;
      if (only !== undefined && matches.length === 1) {
        await this.local.adopt(scope, item, only);
        mapped.add(only.id);
      } else if (matches.length === 0) {
        await items.update(item.id, scope.profileId, { google: null });
      } else {
        for (const task of matches) held.add(task.id);
        await this.askChoice(scope, item, matches);
      }
    }
    return upserts.filter((task) => !held.has(task.id));
  }

  private async mappedOf(scope: Scope, upserts: readonly GoogleTask[]): Promise<Set<string>> {
    const mapped = new Set<string>();
    for (const task of upserts) {
      if ((await this.deps.items.byGoogle(scope.profileId, scope.listId, task.id)).length > 0)
        mapped.add(task.id);
    }
    return mapped;
  }

  private async heldByChoices(scope: Scope): Promise<Set<string>> {
    const held = new Set<string>();
    for (const entry of await this.deps.log.list(scope.profileId)) {
      const choice = entry.choice;
      if (choice?.list_id !== scope.listId || choice.resolved_google_id !== null) continue;
      for (const candidate of choice.candidates) held.add(candidate.google_id);
    }
    return held;
  }

  private async hasOpenChoice(scope: Scope, item: PlannerItemRow): Promise<boolean> {
    return (await this.deps.log.list(scope.profileId)).some(
      (e) => e.choice?.item_id === item.id && e.choice.resolved_google_id === null,
    );
  }

  private async askChoice(
    scope: Scope,
    item: PlannerItemRow,
    tasks: readonly GoogleTask[],
  ): Promise<void> {
    if (await this.hasOpenChoice(scope, item)) return;
    const counts = {
      pulled: tasks.length,
      created: 0,
      updated: 0,
      deleted: 0,
      pushed: 0,
      conflicts: 0,
    };
    await this.deps.log.insert({
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

  private async apply(scope: Scope, task: GoogleTask): Promise<void> {
    const [row] = await this.deps.items.byGoogle(scope.profileId, scope.listId, task.id);
    if (row === undefined) {
      await this.local.importTask(scope, task);
      scope.run.count('created');
    } else if (row.deleted_at === null) {
      await this.local.mergeIn(scope, row, task);
    }
  }
}
