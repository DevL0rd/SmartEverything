import type {
  PhotoGroup,
  PhotoGroupKind,
  PhotoGroupMerge,
  PhotoGroupUpdate,
  PhotoItemFaces,
  PhotoMergeDismiss,
  PhotoMergeSuggestion,
  PhotoPeople,
  PhotoRemoveFaces,
  PhotoSuggestions,
} from '@smarteverything/domain';
import type { DriveActor } from '../../drive/access';
import { PeopleGrouper, type GroupingDeps } from './grouping';

const KINDS: readonly PhotoGroupKind[] = ['person', 'pet'];

export interface PeopleDeps extends GroupingDeps {
  readonly regrouped: (profileId: string) => void;
  readonly suggestions: (profileId: string) => Promise<readonly PhotoMergeSuggestion[]>;
}

export class PeopleService {
  private readonly grouper: PeopleGrouper;
  private readonly suggested = new Map<string, Promise<readonly PhotoMergeSuggestion[]>>();
  private readonly chains = new Map<string, Promise<undefined>>();

  constructor(private readonly deps: PeopleDeps) {
    this.grouper = new PeopleGrouper(deps, (profileId) => {
      this.suggested.delete(profileId);
      deps.regrouped(profileId);
    });
  }

  async drained(): Promise<void> {
    for (const profileId of await this.deps.store.profiles())
      for (const kind of KINDS) await this.regroup(profileId, kind);
  }

  regroup(profileId: string, kind: PhotoGroupKind): Promise<number> {
    const key = `${profileId}:${kind}`;
    const run = (this.chains.get(key) ?? Promise.resolve()).then(() =>
      this.grouper.regroup(profileId, kind),
    );
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(key, settled);
    return run;
  }

  async people(actor: DriveActor, kind?: PhotoGroupKind): Promise<PhotoPeople> {
    const suggestions = await this.suggestionsOf(actor.profileId);
    return await this.deps.store.people(actor, kind, suggestions);
  }

  dismissMerge(actor: DriveActor, dismiss: PhotoMergeDismiss): Promise<void> {
    return this.deps.store.dismissMerge(actor, dismiss);
  }

  group(actor: DriveActor, groupId: string): Promise<PhotoGroup> {
    return this.deps.store.group(actor, groupId);
  }

  update(actor: DriveActor, groupId: string, patch: PhotoGroupUpdate): Promise<PhotoGroup> {
    return this.deps.store.update(actor, groupId, patch);
  }

  async merge(actor: DriveActor, merge: PhotoGroupMerge): Promise<PhotoGroup> {
    const merged = await this.deps.store.merge(actor, merge);
    this.suggested.delete(actor.profileId);
    return merged;
  }

  async removeFaces(
    actor: DriveActor,
    groupId: string,
    body: PhotoRemoveFaces,
  ): Promise<PhotoGroup | null> {
    const kind = await this.deps.store.rejectFaces(actor, groupId, body);
    await this.regroup(actor.profileId, kind);
    this.suggested.delete(actor.profileId);
    const [view] = await this.deps.store.groupsMatching(actor, [groupId]);
    return view ?? null;
  }

  itemFaces(actor: DriveActor, itemId: string): Promise<PhotoItemFaces> {
    return this.deps.store.itemFaces(actor, itemId);
  }

  suggest(actor: DriveActor, query: string): Promise<PhotoSuggestions> {
    return this.deps.store.suggest(actor, query);
  }

  private suggestionsOf(profileId: string): Promise<readonly PhotoMergeSuggestion[]> {
    const cached = this.suggested.get(profileId);
    if (cached !== undefined) return cached;
    const computed = this.deps.suggestions(profileId);
    this.suggested.set(profileId, computed);
    computed.catch((cause: unknown) => {
      if (this.suggested.get(profileId) === computed) this.suggested.delete(profileId);
      this.deps.log.error('groups.suggestions_failed', cause, { profileId });
    });
    return computed;
  }
}
