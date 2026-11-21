import {
  DEFAULT_COMPUTER_SCOPES,
  type ClientRow,
  type ComputerScopes,
  type ComputerScopesPatch,
  type DeviceRow,
  type LiveChange,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { StoreNotFoundError } from './context';
import type { ChangeFeed } from './feed';
import type { StoreHost } from './host/host';
import { storeUnit } from './host/unit';
import type { ComputerViewer } from '../computers/computer-access';
import type { ComputerNodeFacts } from './repositories/computer-nodes';

export class ComputerAccessStateNotLoadedError extends Error {
  override readonly name = 'ComputerAccessStateNotLoadedError';

  constructor() {
    super('The computer access state was read before it was loaded from the store host.');
  }
}

export const COMPUTER_ACCESS_STATE_UNIT = storeUnit((store, _input: null) => ({
  nodes: store.computerNodes.facts(),
  scopes: store.computerScopes.all(),
  devices: store.devices.list().map(({ id, kind }) => ({ id, kind })),
  clients: store.clients.list().map(({ id, profile_id }) => ({ id, profileId: profile_id })),
}));

export const COMPUTER_NODE_FACTS_UNIT = storeUnit(
  (store, deviceId: string): ComputerNodeFacts | null =>
    store.computerNodes.factsOf(deviceId) ?? null,
);

type Followed = Extract<LiveChange, { table: 'devices' | 'clients' | 'profiles' }>;

function followed(change: LiveChange): change is Followed {
  return change.table === 'devices' || change.table === 'clients' || change.table === 'profiles';
}

export class ComputerAccessState {
  private readonly nodes = new Map<string, ComputerNodeFacts>();
  private readonly scopeRows = new Map<string, ComputerScopes>();
  private readonly kinds = new Map<string, string>();
  private readonly clientProfiles = new Map<string, string | null>();
  private loading: Promise<void> | null = null;
  private refreshing: Promise<void> = Promise.resolve();
  private replay: (() => void)[] | null = null;
  private ready = false;

  constructor(
    feed: ChangeFeed,
    private readonly host: StoreHost,
  ) {
    feed.subscribe((change) => {
      if (!followed(change)) return;
      this.record(() => {
        this.apply(change);
      });
    });
  }

  load(): Promise<void> {
    this.loading ??= this.fill();
    return this.loading;
  }

  personOf(deviceId: string): string | null {
    this.assertReady();
    return this.nodes.get(deviceId)?.profile_id ?? null;
  }

  scopes(deviceId: string): ComputerScopes {
    this.assertReady();
    return this.scopeRows.get(deviceId) ?? DEFAULT_COMPUTER_SCOPES;
  }

  viewerOfClient(client: Pick<ClientRow, 'id' | 'role'>): ComputerViewer {
    if (client.role === 'owner') return { owner: true, profileId: null };
    this.assertReady();
    const profileId = this.clientProfiles.get(client.id) ?? null;
    if (profileId === null) throw new StoreNotFoundError('active profile of the client', client.id);
    return { owner: false, profileId };
  }

  hidden(viewer: ComputerViewer, device: Pick<DeviceRow, 'id' | 'kind'>): boolean {
    if (viewer.owner || device.kind !== 'computer') return false;
    return this.personOf(device.id) !== viewer.profileId;
  }

  visible(deviceId: string, viewer: ComputerViewer): boolean {
    return viewer.owner || this.personOf(deviceId) === viewer.profileId;
  }

  watchable(deviceId: string, viewer: ComputerViewer): boolean {
    this.assertReady();
    const kind = this.kinds.get(deviceId);
    if (kind === undefined) return false;
    return kind !== 'computer' || this.visible(deviceId, viewer);
  }

  async claimed(deviceId: string): Promise<void> {
    await this.load();
    const facts = await this.host.read('computerNodeFacts', deviceId);
    this.record(() => {
      if (facts === null) this.nodes.delete(deviceId);
      else this.nodes.set(deviceId, facts);
    });
  }

  async revoke(deviceId: string): Promise<void> {
    await this.load();
    this.record(() => {
      this.nodes.delete(deviceId);
    });
    await this.host.call('computerNodes', 'revoke', deviceId);
  }

  async saveScopes(deviceId: string, patch: ComputerScopesPatch): Promise<ComputerScopes> {
    await this.load();
    const scopes = await this.host.call('computerScopes', 'update', deviceId, patch);
    this.record(() => {
      this.scopeRows.set(deviceId, scopes);
    });
    return scopes;
  }

  private assertReady(): void {
    if (!this.ready) throw new ComputerAccessStateNotLoadedError();
  }

  private record(change: () => void): void {
    if (this.ready) change();
    this.replay?.push(change);
  }

  private async fill(): Promise<void> {
    await this.reload();
    this.ready = true;
  }

  private refresh(): void {
    const next = this.refreshing.then(() => this.reload());
    this.refreshing = next;
    background(next, 'computer_access.refresh_failed');
  }

  private async reload(): Promise<void> {
    const replay: (() => void)[] = [];
    this.replay = replay;
    try {
      const snapshot = await this.host.read('computerAccessState', null);
      this.nodes.clear();
      for (const node of snapshot.nodes) this.nodes.set(node.device_id, node);
      this.scopeRows.clear();
      for (const row of snapshot.scopes) this.scopeRows.set(row.deviceId, row.scopes);
      this.kinds.clear();
      for (const device of snapshot.devices) this.kinds.set(device.id, device.kind);
      this.clientProfiles.clear();
      for (const client of snapshot.clients) this.clientProfiles.set(client.id, client.profileId);
      for (const change of replay) change();
    } finally {
      if (this.replay === replay) this.replay = null;
    }
  }

  private apply(change: Followed): void {
    if (change.table === 'devices') {
      this.deviceChanged(change.record, change.oldRecord);
      return;
    }
    if (change.table === 'profiles') {
      if (change.record === null && change.oldRecord !== null) this.refresh();
      return;
    }
    this.clientChanged(change.record, change.oldRecord);
  }

  private deviceChanged(record: DeviceRow | null, oldRecord: DeviceRow | null): void {
    if (record !== null) {
      this.kinds.set(record.id, record.kind);
      return;
    }
    if (oldRecord === null) return;
    this.kinds.delete(oldRecord.id);
    this.nodes.delete(oldRecord.id);
    this.scopeRows.delete(oldRecord.id);
  }

  private clientChanged(record: ClientRow | null, oldRecord: ClientRow | null): void {
    if (record === null) {
      if (oldRecord === null) return;
      this.clientProfiles.delete(oldRecord.id);
      for (const [deviceId, node] of this.nodes)
        if (node.window_client_id === oldRecord.id)
          this.nodes.set(deviceId, { ...node, window_client_id: null });
      return;
    }
    this.clientProfiles.set(record.id, record.profile_id);
    if (oldRecord === null || oldRecord.profile_id === record.profile_id) return;
    for (const [deviceId, node] of this.nodes)
      if (node.window_client_id === record.id)
        this.nodes.set(deviceId, { ...node, profile_id: record.profile_id });
  }
}
