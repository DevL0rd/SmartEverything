import type { DrivePlacement } from '@smarteverything/domain';
import type { SyncHubMessage } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import { pathRefusal, type PathFacts, type PathFs } from './placement-paths.js';
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
  readonly stop: () => void;
}

export interface SubscribeHello {
  readonly indexId: string | null;
  readonly afterSeq: number;
}

export interface SubscribeHandlers {
  readonly hello: () => SubscribeHello;
  readonly message: (message: SyncHubMessage) => void;
}

export type OpenSubscribe = (placementId: string, handlers: SubscribeHandlers) => SubscribeChannel;

export interface PlacementsPorts {
  readonly link: LinkPort;
  readonly cache: CachePort;
  readonly helper: HelperPort;
  readonly route: RoutePort;
  readonly openSubscribe: OpenSubscribe;
  readonly facts: PathFacts;
  readonly fs: PathFs;
  readonly synced: (placements: readonly DrivePlacement[]) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

interface SubscriptionWiring {
  readonly placementId: string;
  readonly open: OpenSubscribe;
  readonly forward: (paths: readonly string[]) => void;
}

class PlacementSubscription {
  private indexId: string | null = null;
  private seq = 0;
  private readonly channel: SubscribeChannel;

  constructor(private readonly wiring: SubscriptionWiring) {
    this.channel = wiring.open(wiring.placementId, {
      hello: () => ({ indexId: this.indexId, afterSeq: this.seq }),
      message: (text) => {
        this.receive(text);
      },
    });
  }

  stop(): void {
    this.channel.stop();
  }

  private receive(message: SyncHubMessage): void {
    if (message.type === 'index') {
      this.indexId = message.indexId;
      this.seq = message.seq;
      if (message.last) this.wiring.forward([]);
    } else if (message.type === 'index_update') {
      this.seq = message.seq;
      if (message.entries.length > 0) {
        this.wiring.forward(message.entries.map((entry) => entry.relPath));
      }
    }
  }
}

export class PlacementsController {
  readonly states: PlacementStates;
  private readonly running = new Map<string, Running>();
  private readonly subscriptions = new Map<string, PlacementSubscription>();
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
    this.subscribe(placement.id);
    this.ports.helper.send({
      op: 'mount',
      mount: placement.id,
      root: placement.rootId,
      folder: placement.folderItemId ?? '',
      point: placement.localPath,
    });
  }

  private subscribe(mount: string): void {
    this.subscriptions.set(
      mount,
      new PlacementSubscription({
        placementId: mount,
        open: this.ports.openSubscribe,
        forward: (paths): void => {
          this.ports.helper.send({ op: 'invalidate', mount, paths });
        },
      }),
    );
  }

  private release(id: string): void {
    const running = this.running.get(id);
    if (running === undefined) return;
    this.running.delete(id);
    this.states.forget(id);
    if (running.placement.mode !== 'mounted') return;
    this.subscriptions.get(id)?.stop();
    this.subscriptions.delete(id);
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
