import type { AccessScopes, ClientRow, LiveChange, PersonBudget } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { StoreNotFoundError } from './context';
import type { ChangeFeed } from './feed';
import type { StoreHost } from './host/host';
import { storeUnit } from './host/unit';
import type { PersonStanding } from './repositories/person-access';
import { privateDevicesOf, privateToOthers, type PrivateDevice } from '../server/private-devices';

export class AccessMirrorNotLoadedError extends Error {
  override readonly name = 'AccessMirrorNotLoadedError';

  constructor() {
    super('The person access mirror was read before it was loaded from the store host.');
  }
}

interface PersonFacts {
  readonly profileId: string;
  readonly name: string;
  readonly budget: PersonBudget | null | undefined;
  readonly scopes: AccessScopes | undefined;
  readonly standing: PersonStanding;
}

export interface AccessFacts {
  readonly owner: string | null;
  readonly people: readonly PersonFacts[];
  readonly clients: readonly ClientRow[];
  readonly privates: readonly PrivateDevice[];
}

function homeOwnerOf(owner: () => string): string | null {
  try {
    return owner();
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return null;
    throw cause;
  }
}

export const ACCESS_MIRROR_UNIT = storeUnit((store, _input: null): AccessFacts => ({
  owner: homeOwnerOf(() => store.personAccess.homeOwner()),
  people: store.profiles.list().map((profile) => ({
    profileId: profile.id,
    name: profile.name,
    budget: store.personAccess.budget(profile.id),
    scopes: store.personAccess.scopes(profile.id),
    standing: store.personAccess.standing(profile.id),
  })),
  clients: store.clients.list(),
  privates: privateDevicesOf(store),
}));

type ClientChange = Extract<LiveChange, { table: 'clients' }>;

type DeviceChange = Extract<LiveChange, { table: 'devices' }>;

function localDeviceMoved(change: DeviceChange): boolean {
  const { record, oldRecord } = change;
  if (record !== null && oldRecord !== null) return false;
  return (record ?? oldRecord)?.provider === 'local';
}

function reshaped(change: ClientChange): boolean {
  const { record, oldRecord } = change;
  if (record === null || oldRecord === null) return true;
  return record.profile_id !== oldRecord.profile_id || record.built_in !== oldRecord.built_in;
}

export class AccessMirror {
  private facts: AccessFacts | null = null;
  private people = new Map<string, PersonFacts>();
  private clientRows = new Map<string, ClientRow>();
  private loading: Promise<void> | null = null;
  private reading: Promise<void> | null = null;
  private asked = 0;

  constructor(
    feed: ChangeFeed,
    private readonly host: StoreHost,
  ) {
    feed.subscribe((change) => {
      if (change.table === 'clients') this.clientChanged(change);
      if (
        change.table === 'profiles' ||
        (change.table === 'clients' && reshaped(change)) ||
        (change.table === 'devices' && localDeviceMoved(change))
      )
        this.changed();
    });
    feed.subscribeAccess(() => {
      this.changed();
    });
  }

  load(): Promise<void> {
    if (this.loading === null) {
      this.reading = this.refresh();
      this.loading = this.reading;
    }
    return this.loading;
  }

  settled(): Promise<void> {
    return this.reading ?? Promise.resolve();
  }

  homeOwner(): string {
    const owner = this.loaded().owner;
    if (owner === null) throw new StoreNotFoundError('owner person', 'home');
    return owner;
  }

  budget(profileId: string): PersonBudget | null | undefined {
    return this.person(profileId)?.budget;
  }

  budgetedIds(): string[] {
    return this.loaded()
      .people.filter((person) => person.budget !== undefined && person.budget !== null)
      .map((person) => person.profileId);
  }

  scopes(profileId: string): AccessScopes | undefined {
    return this.person(profileId)?.scopes;
  }

  standing(profileId: string): PersonStanding {
    return this.person(profileId)?.standing ?? { known: false, reason: 'missing' };
  }

  activeProfileOf(clientId: string): string {
    const profileId = this.client(clientId).profile_id;
    if (profileId === null) throw new StoreNotFoundError('active profile of the client', clientId);
    return profileId;
  }

  client(clientId: string): ClientRow {
    this.loaded();
    const client = this.clientRows.get(clientId);
    if (client === undefined) throw new StoreNotFoundError('client', clientId);
    return client;
  }

  clients(): ClientRow[] {
    this.loaded();
    return [...this.clientRows.values()];
  }

  profileIds(): string[] {
    return this.loaded().people.map((person) => person.profileId);
  }

  privateToOthers(profileId: string): string[] {
    return privateToOthers(this.loaded().privates, profileId);
  }

  name(profileId: string): string {
    const person = this.person(profileId);
    if (person === undefined) throw new StoreNotFoundError('profile', profileId);
    return person.name;
  }

  private person(profileId: string): PersonFacts | undefined {
    this.loaded();
    return this.people.get(profileId);
  }

  private loaded(): AccessFacts {
    if (this.facts === null) throw new AccessMirrorNotLoadedError();
    return this.facts;
  }

  private changed(): void {
    if (this.loading === null) return;
    this.asked += 1;
    if (this.reading !== null) return;
    this.reading = this.refresh();
    background(this.reading, 'store.access_mirror_refresh_failed');
  }

  private clientChanged(change: ClientChange): void {
    if (this.facts === null) return;
    if (change.record !== null) this.clientRows.set(change.record.id, change.record);
    else if (change.oldRecord !== null) this.clientRows.delete(change.oldRecord.id);
  }

  private take(facts: AccessFacts): void {
    this.facts = facts;
    this.people = new Map(facts.people.map((person) => [person.profileId, person]));
    this.clientRows = new Map(facts.clients.map((client) => [client.id, client]));
  }

  private async refresh(): Promise<void> {
    try {
      let read = -1;
      while (read !== this.asked) {
        read = this.asked;
        const facts = await this.host.read('accessMirror', null);
        if (read === this.asked) this.take(facts);
      }
    } finally {
      this.reading = null;
    }
  }
}
