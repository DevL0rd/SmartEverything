import type { DrivePlacement } from '@smarteverything/domain';
import { SYNC_HELLO, SYNC_HUB_MESSAGE } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import { FolderScope, pathRefusal, type PathFacts, type PathFs } from './placement-paths.js';
import {
  PlacementStates,
  inOrder,
  isActive,
  mountFields,
  parseHelperLine,
  routeKind,
  specOf,
  type HelperLine,
  type PlacementFields,
  type PlacementReport,
  type Running,
  type RouteEndpointState,
  type RouteKind,
} from './placement-state.js';

export type ControlLine =
  | {
      readonly op: 'mount';
      readonly mount: string;
      readonly root: string;
      readonly folder: string;
      readonly point: string;
    }
  | { readonly op: 'unmount'; readonly mount: string }
  | { readonly op: 'invalidate'; readonly mount: string; readonly paths: readonly string[] };

export interface HelperPort {
  readonly send: (line: ControlLine) => void;
  readonly onLine: (listener: (raw: string) => void) => () => void;
}

export interface LinkPort {
  readonly onPlacements: (listener: (placements: readonly DrivePlacement[]) => void) => () => void;
  readonly onMountsDemand: (listener: (demanded: boolean) => void) => () => void;
  readonly mountsDemanded: () => boolean;
  readonly report: (report: PlacementReport) => void;
}

export interface CachePort {
  readonly all: () => readonly DrivePlacement[];
  readonly replaceAll: (placements: readonly DrivePlacement[]) => void;
  readonly clear: () => void;
}

export interface RoutePort {
  readonly state: () => RouteEndpointState;
  readonly subscribe: (listener: (state: RouteEndpointState) => void) => () => void;
}

export interface SubscribeChannel {
  readonly send: (text: string) => void;
  readonly stop: () => void;
}

export interface SubscribeHandlers {
  readonly opened: () => void;
  readonly message: (text: string) => void;
}

export type OpenSubscribe = (rootId: string, handlers: SubscribeHandlers) => SubscribeChannel;

export interface PlacementsPorts {
  readonly link: LinkPort;
  readonly cache: CachePort;
  readonly helper: HelperPort;
  readonly route: RoutePort;
  readonly openSubscribe: OpenSubscribe;
  readonly facts: PathFacts;
  readonly fs: PathFs;
  readonly synced: (placements: readonly DrivePlacement[]) => void;
  readonly newId: () => string;
  readonly now: () => Date;
  readonly log: Logger;
}

interface SubscriptionWiring {
  readonly rootId: string;
  readonly clientId: string;
  readonly open: OpenSubscribe;
  readonly forward: (mountId: string, paths: readonly string[]) => void;
  readonly log: Logger;
}

class RootSubscription {
  private readonly scopes = new Map<string, FolderScope>();
  private indexId: string | null = null;
  private seq = 0;
  private channel: SubscribeChannel | null = null;

  constructor(private readonly wiring: SubscriptionWiring) {}

  add(mountId: string, folderItemId: string | null): void {
    this.scopes.set(mountId, new FolderScope(folderItemId));
    this.channel ??= this.wiring.open(this.wiring.rootId, {
      opened: () => {
        this.hello();
      },
      message: (text) => {
        this.receive(text);
      },
    });
  }

  remove(mountId: string): boolean {
    this.scopes.delete(mountId);
    if (this.scopes.size > 0) return false;
    this.stop();
    return true;
  }

  stop(): void {
    this.channel?.stop();
    this.channel = null;
  }

  private hello(): void {
    this.channel?.send(
      JSON.stringify(
        SYNC_HELLO.parse({
          type: 'hello',
          clientId: this.wiring.clientId,
          rootId: this.wiring.rootId,
          indexId: this.indexId,
          afterSeq: this.seq,
        }),
      ),
    );
  }

  private receive(text: string): void {
    const parsed = SYNC_HUB_MESSAGE.safeParse(JSON.parse(text));
    if (!parsed.success) {
      this.wiring.log.warn('drive_mount.subscribe_message_rejected', {
        root_id: this.wiring.rootId,
      });
      return;
    }
    const message = parsed.data;
    if (message.type === 'index') {
      this.indexId = message.indexId;
      this.seq = message.seq;
      for (const scope of this.scopes.values()) scope.invalidation(message.entries);
      if (message.last) this.forwardAll([]);
    } else if (message.type === 'index_update') {
      this.seq = message.seq;
      for (const [mountId, scope] of this.scopes) {
        const paths = scope.invalidation(message.entries);
        if (paths !== null) this.wiring.forward(mountId, paths);
      }
    }
  }

  private forwardAll(paths: readonly string[]): void {
    for (const mountId of this.scopes.keys()) this.wiring.forward(mountId, paths);
  }
}

export class PlacementsController {
  readonly states: PlacementStates;
  private readonly running = new Map<string, Running>();
  private readonly roots = new Map<string, RootSubscription>();
  private readonly stops: (() => void)[] = [];
  private queue: Promise<void> = Promise.resolve();
  private route: RouteKind;
  private handedOver = '[]';
  private ended = false;

  constructor(private readonly ports: PlacementsPorts) {
    this.route = routeKind(ports.route.state());
    this.states = new PlacementStates(
      { report: ports.link.report, mountsDemanded: ports.link.mountsDemanded },
      ports.now,
    );
  }

  start(): void {
    const { link, helper, route, cache } = this.ports;
    this.stops.push(
      route.subscribe((state) => {
        this.routeChanged(routeKind(state));
      }),
      helper.onLine((raw) => {
        this.helperLine(raw);
      }),
      link.onMountsDemand((on) => {
        this.states.demanded(on);
      }),
    );
    this.enqueue(cache.all());
    this.stops.push(
      link.onPlacements((placements) => {
        cache.replaceAll(placements);
        this.enqueue(placements);
      }),
    );
  }

  stop(): void {
    this.end();
    this.releaseAll();
  }

  revoke(): void {
    this.end();
    this.releaseAll();
    this.ports.cache.clear();
    this.states.clear();
    this.handOver();
  }

  private end(): void {
    this.ended = true;
    for (const stop of this.stops.splice(0)) stop();
  }

  private releaseAll(): void {
    for (const id of [...this.running.keys()]) this.release(id);
  }

  private enqueue(placements: readonly DrivePlacement[]): void {
    this.queue = this.queue
      .then(() => this.reconcile(placements))
      .catch((cause: unknown) => {
        this.ports.log.error('drive_mount.reconcile_failed', cause);
      });
  }

  private async reconcile(placements: readonly DrivePlacement[]): Promise<void> {
    if (this.ended) return;
    const active = placements.filter(isActive).sort(inOrder);
    const wanted = new Map(active.map((placement) => [placement.id, specOf(placement)]));
    for (const [id, running] of [...this.running]) {
      if (wanted.get(id) !== specOf(running.placement)) this.release(id);
    }
    const accepted: DrivePlacement[] = [];
    for (const placement of active) {
      if (this.running.has(placement.id) || (await this.admit(placement, accepted))) {
        accepted.push(placement);
      }
    }
    this.handOver();
  }

  private async admit(
    placement: DrivePlacement,
    earlier: readonly DrivePlacement[],
  ): Promise<boolean> {
    const refusal = await this.refusal(placement, earlier);
    if (refusal !== null) {
      this.ports.log.warn('drive_mount.placement_blocked', { placement_id: placement.id });
      this.states.set(placement.id, this.blocked(refusal));
      return false;
    }
    this.begin(placement);
    return true;
  }

  private async refusal(
    placement: DrivePlacement,
    earlier: readonly DrivePlacement[],
  ): Promise<string | null> {
    const { facts, fs } = this.ports;
    try {
      const refused = await pathRefusal({ placement, earlier, requireEmpty: true }, facts, fs);
      if (refused !== null || placement.mode !== 'mounted') return refused;
      if (facts.platform !== 'win32' && (await fs.inspect(placement.localPath)) === 'absent') {
        await fs.create(placement.localPath);
      }
      return null;
    } catch (cause) {
      return `The folder cannot be used: ${messageOf(cause)}`;
    }
  }

  private blocked(reason: string): PlacementFields {
    return {
      state: 'blocked',
      tier: null,
      basicLimits: null,
      readOnly: false,
      route: null,
      reason,
    };
  }

  private begin(placement: DrivePlacement): void {
    const running: Running = { placement, helperState: 'starting', reason: null };
    this.running.set(placement.id, running);
    if (placement.mode === 'synced') {
      this.states.set(placement.id, { state: 'starting', route: this.route });
      return;
    }
    this.states.set(placement.id, mountFields(running, this.route));
    this.subscription(placement.rootId).add(placement.id, placement.folderItemId);
    this.ports.helper.send({
      op: 'mount',
      mount: placement.id,
      root: placement.rootId,
      folder: placement.folderItemId ?? '',
      point: placement.localPath,
    });
  }

  private subscription(rootId: string): RootSubscription {
    const known = this.roots.get(rootId);
    if (known !== undefined) return known;
    const created = new RootSubscription({
      rootId,
      clientId: this.ports.newId(),
      open: this.ports.openSubscribe,
      forward: (mount: string, paths: readonly string[]): void => {
        this.ports.helper.send({ op: 'invalidate', mount, paths });
      },
      log: this.ports.log,
    });
    this.roots.set(rootId, created);
    return created;
  }

  private release(id: string): void {
    const running = this.running.get(id);
    if (running === undefined) return;
    this.running.delete(id);
    this.states.forget(id);
    if (running.placement.mode !== 'mounted') return;
    const { rootId } = running.placement;
    if (this.roots.get(rootId)?.remove(id) === true) this.roots.delete(rootId);
    this.ports.helper.send({ op: 'unmount', mount: id });
  }

  private routeChanged(route: RouteKind): void {
    this.route = route;
    for (const [id, running] of this.running) {
      this.states.set(
        id,
        running.placement.mode === 'mounted' ? mountFields(running, route) : { route },
      );
    }
  }

  private helperLine(raw: string): void {
    try {
      this.applyHelper(parseHelperLine(raw));
    } catch (cause) {
      this.ports.log.warn('drive_mount.helper_line_rejected', { error: messageOf(cause) });
    }
  }

  private applyHelper(line: HelperLine): void {
    if (line.type === 'counters') {
      const { mount, cacheBytes, pinnedBytes, openFiles, pendingUploads } = line;
      if (this.running.has(mount)) {
        this.states.counters(mount, { cacheBytes, pinnedBytes, openFiles, pendingUploads });
      }
      return;
    }
    const running = line.mount === undefined ? undefined : this.running.get(line.mount);
    if (line.mount === undefined || running === undefined) {
      if (line.type === 'error') {
        this.ports.log.warn('drive_mount.helper_error', { reason: line.reason });
      }
      return;
    }
    running.helperState = line.type === 'error' ? 'failed' : line.state;
    running.reason = line.reason ?? null;
    this.states.set(line.mount, mountFields(running, this.route));
  }

  private handOver(): void {
    const synced = [...this.running.values()]
      .map((running) => running.placement)
      .filter((placement) => placement.mode === 'synced');
    const key = JSON.stringify(synced.map((placement) => [placement.id, specOf(placement)]));
    if (key === this.handedOver) return;
    this.handedOver = key;
    this.ports.synced(synced);
  }
}
