import { mkdir, readdir, rm } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { env } from 'node:process';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type {
  ComputerServiceConfig,
  DesktopDriveCommand,
  DesktopDriveState,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { HubBlockUploader } from '../drive-sync/block-upload.js';
import { createBlockHasher, bundledBlockWorker, type BlockHasher } from '../drive-sync/blocks.js';
import {
  DRIVE_SYNC_DATABASE_FILE,
  openDriveSyncDatabase,
  type DriveSyncDatabase,
} from '../drive-sync/db/index.js';
import { DriveSyncEngine, type EngineSink } from '../drive-sync/engine.js';
import { createMetaPort, type MetaPort } from '../drive-sync/meta-port.js';
import { SyncPlacementIntake, type SyncTarget } from '../drive-sync/service.js';
import { SyncSocket, type SyncSocketTransport } from '../drive-sync/socket.js';
import { ignoreMatcherOf } from '../drive-sync/state.js';
import { HubBlockSource } from '../drive-sync/transfer.js';
import { nodeSystem } from '../service/system.js';
import { DriveSyncNotStartedError, ENGINE_TIMINGS } from './computer-drive-sync.js';
import { MountController } from './controller.js';
import { driveControlAddress } from './control-protocol.js';
import { DriveControlServer } from './control-server.js';
import { detectFuse, nodeFuseExists, recoverStaleMount, type FuseStatus } from './fuse-detect.js';
import { HelperProcess, nodeSpawnHelper } from './helper-process.js';
import { validateTuning } from './helper-tuning-report.js';
import {
  DriveSettingsFile,
  helperCacheOf,
  helperRouteOf,
  helperTuningOf,
  routeWordOf,
  type HelperRouteSource,
} from './helper-settings.js';
import {
  MountLocations,
  mountAreaOf,
  nodeLetterInUse,
  runtimeDirectoryOf,
  type LocationFacts,
} from './mount-location.js';
import { MountPlaces, nodePlacesFs, placesFilesOf, type MountPlace } from './mount-places.js';
import type { MountTray } from './mount-state.js';
import { FilePlacementCache } from './placement-cache.js';
import { nodePathFs, systemDirectories } from './placement-paths.js';
import { nodeReadText } from './placement-basic.js';
import type { RouteEndpointState } from './placement-state.js';
import {
  PlacementsController,
  type PlacementsPorts,
  type SubscribeHandlers,
} from './placements.js';
import { PlacementRelay, type PlacementFeed } from './relay-link.js';
import { SocketRouter } from './socket-router.js';
import { SyncEngineHost, type EngineHandle } from './sync-engines.js';

const NOTIFY_QUIET_MS = 250;
const PLACEMENT_CACHE_FILE = 'drive-placements.json';
const LEGACY_CACHE_SETTINGS_FILE = 'drive-cache.json';
const DRIVE_SETTINGS_FILE = 'drive-settings.json';
const HELPER_FOLDER = 'drive-mount';
const HELPER_NAME = 'se-drive-mount';
const NO_MOUNTS: FuseStatus = {
  available: false,
  missing: [],
  command: null,
  reason: 'Mounted folders are available on Linux; this computer can sync folders',
};

export interface ComputerDriveContext {
  readonly layout: { readonly root: string; readonly driveMountCache: string };
  readonly node: Pick<ComputerServiceConfig['node'], 'hub_url' | 'node_token'>;
  readonly transport: SyncSocketTransport & { readonly fetch: typeof fetch };
  readonly authority: HelperRouteSource & {
    readonly state: RouteEndpointState;
    readonly subscribe: (listener: (state: RouteEndpointState) => void) => () => void;
  };
  readonly log: Logger;
}

export interface ComputerDriveRuntime {
  readonly start: () => Promise<void>;
  readonly attach: (feed: PlacementFeed) => void;
  readonly stop: () => Promise<void>;
}

export function bundledDriveMountHelper(): string {
  return fileURLToPath(new URL(`./${HELPER_FOLDER}/${HELPER_NAME}`, import.meta.url));
}

export class ComputerDrive implements ComputerDriveRuntime {
  private readonly relay = new PlacementRelay();
  private readonly router = new SocketRouter();
  private readonly cache: FilePlacementCache;
  private readonly settings: DriveSettingsFile;
  private stopRoute: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly platform = process.platform;
  private readonly locationFacts: LocationFacts = {
    platform: this.platform,
    runtimeDirectory: runtimeDirectoryOf(env, userInfo().uid),
  };
  private readonly locations = new MountLocations(this.locationFacts, {
    fs: nodePathFs,
    letterInUse: nodeLetterInUse,
  });
  private readonly places: MountPlaces | null;
  private readonly socket: SyncSocket;
  private readonly helper: HelperProcess;
  private readonly host: SyncEngineHost;
  private readonly intake: SyncPlacementIntake;
  private readonly controller: MountController;
  private readonly server: DriveControlServer;
  private readonly hasher: BlockHasher;
  private readonly meta: MetaPort;
  private database: DriveSyncDatabase | null = null;
  private fuse: FuseStatus = { available: true };
  private mount: MountTray | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly context: ComputerDriveContext) {
    const { layout, node, transport, log } = context;
    this.cache = new FilePlacementCache(join(layout.root, PLACEMENT_CACHE_FILE), log);
    this.settings = new DriveSettingsFile(
      join(layout.root, DRIVE_SETTINGS_FILE),
      join(layout.root, LEGACY_CACHE_SETTINGS_FILE),
    );
    const area = mountAreaOf(this.locationFacts);
    this.places =
      this.platform === 'linux' && area !== null
        ? new MountPlaces(placesFilesOf(env, homedir(), area), nodePlacesFs, log)
        : null;
    this.socket = new SyncSocket({
      hubUrl: node.hub_url,
      token: node.node_token,
      transport,
      sink: this.router,
      log,
    });
    this.hasher = createBlockHasher({ workerFile: bundledBlockWorker(), log });
    this.meta = createMetaPort({ binary: bundledDriveMountHelper(), platform: this.platform, log });
    this.host = new SyncEngineHost({
      create: (target, sink): EngineHandle => this.engineOf(target, sink),
      prepare: async (target): Promise<void> => {
        await mkdir(target.localPath, { recursive: true });
      },
      quietMs: NOTIFY_QUIET_MS,
      log,
    });
    this.intake = new SyncPlacementIntake(this.host, log);
    this.helper = new HelperProcess(
      {
        binary: bundledDriveMountHelper(),
        cacheDirectory: layout.driveMountCache,
        token: (): Promise<string> => Promise.resolve(node.node_token),
        spawn: nodeSpawnHelper,
      },
      log,
    );
    this.controller = this.mountController();
    this.server = new DriveControlServer({
      address: driveControlAddress(this.platform, layout.root),
      platform: this.platform,
      target: this,
      log,
    });
    this.host.onChange(() => {
      this.changed();
    });
  }

  async start(): Promise<void> {
    const { layout, log } = this.context;
    await mkdir(layout.root, { recursive: true });
    this.database = openDriveSyncDatabase(join(layout.root, DRIVE_SYNC_DATABASE_FILE), log);
    const { cache, tuning } = await this.settings.read();
    this.helper.configure(helperCacheOf(cache));
    this.helper.configure(helperTuningOf(tuning));
    this.followRoute();
    await this.controller.start();
    await this.server.start();
  }

  attach(feed: PlacementFeed): void {
    this.relay.attach(feed);
  }

  async stop(): Promise<void> {
    this.stopRoute?.();
    this.stopRoute = null;
    await this.server.stop();
    await this.controller.stop();
    await this.intake.stopAll();
    await this.host.close();
    this.socket.stop();
    await this.hasher.close();
    await this.meta.close();
    this.database?.close();
    this.database = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async state(): Promise<DesktopDriveState> {
    const summary = await this.host.summary();
    const { cache, tuning } = await this.settings.read();
    return {
      mount: this.mount,
      sync: summary,
      fuse: this.fuse,
      cache,
      tuning: this.controller.tuning(tuning),
    };
  }

  async run(command: DesktopDriveCommand): Promise<void> {
    switch (command.kind) {
      case 'sync-pause':
        await this.host.pause();
        return;
      case 'sync-resume':
        await this.host.resume();
        return;
      case 'cache':
        await this.settings.writeCache(command.cache);
        this.helper.configure(helperCacheOf(command.cache));
        this.changed();
        return;
      case 'tuning':
        validateTuning(command.tuning, this.controller.tuning(command.tuning).limits);
        await this.settings.writeTuning(command.tuning);
        this.helper.configure(helperTuningOf(command.tuning));
        this.changed();
        return;
      case 'again':
      case 'remount':
      case 'clear-cache':
      case 'pin':
      case 'unpin':
        await this.controller.run(command);
    }
  }

  private followRoute(): void {
    const { authority, log } = this.context;
    const send = (): void => {
      const line = helperRouteOf(authority.state.endpoint, authority.view.trust);
      log.info('drive_mount.route_sent', { route: routeWordOf(line) });
      this.helper.configure(line);
    };
    send();
    this.stopRoute = authority.subscribe(send);
  }

  private mountController(): MountController {
    const { layout, log } = this.context;
    const run = nodeSystem.run;
    const tier = { run, readText: nodeReadText, exists: nodeFuseExists };
    return new MountController({
      fuse: async (): Promise<FuseStatus> => {
        this.fuse = this.platform === 'linux' ? await detectFuse(tier) : NO_MOUNTS;
        return this.fuse;
      },
      recover: (point) => recoverStaleMount(run, point),
      stalePoints: () => this.stalePoints(),
      known: () => this.cache.all(),
      helper: this.helper,
      link: this.relay,
      sleep: pause,
      createPlacements: (ports) => this.placementsOf(ports),
      clearCache: () => rm(layout.driveMountCache, { recursive: true, force: true }),
      tray: (state): void => {
        this.mount = state;
        this.changed();
      },
      tuningChanged: (): void => {
        this.changed();
      },
      log,
    });
  }

  private placementsOf(ports: Pick<PlacementsPorts, 'helper' | 'link'>): PlacementsController {
    const { layout, log } = this.context;
    return new PlacementsController({
      ...ports,
      cache: this.cache,
      route: {
        state: () => this.context.authority.state,
        subscribe: (listener) => this.context.authority.subscribe(listener),
      },
      openSubscribe: (placementId, handlers) => this.subscribe(placementId, handlers),
      facts: {
        platform: this.platform,
        dataDirectory: layout.root,
        systemDirectories: systemDirectories(this.platform, env),
      },
      locations: this.locations,
      places: (shown): void => {
        this.showPlaces(shown);
      },
      synced: (placements): void => {
        this.intake.accept(placements).catch((cause: unknown) => {
          log.error('drive_sync.intake_failed', cause);
        });
      },
      now: () => new Date(),
      log,
    });
  }

  private showPlaces(shown: readonly MountPlace[]): void {
    this.places?.show(shown).catch((cause: unknown) => {
      this.context.log.error('drive_mount.places_failed', cause);
    });
  }

  private async stalePoints(): Promise<readonly string[]> {
    const area = this.platform === 'linux' ? this.locations.area : null;
    if (area === null) return [];
    try {
      return (await readdir(area)).map((name) => join(area, name));
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
      throw cause;
    }
  }

  private subscribe(
    placementId: string,
    handlers: SubscribeHandlers,
  ): { readonly stop: () => void } {
    const unroute = this.router.route(placementId, {
      opened: () => undefined,
      message: (_id, message) => {
        handlers.message(message);
      },
      closed: () => undefined,
    });
    this.socket.attach({ placementId, hello: handlers.hello });
    return {
      stop: (): void => {
        this.socket.detach(placementId);
        unroute();
      },
    };
  }

  private engineOf(target: SyncTarget, sink: EngineSink): EngineHandle {
    const { database } = this;
    if (database === null) throw new DriveSyncNotStartedError();
    const { node, transport, log } = this.context;
    const hub = { hubUrl: node.hub_url, token: node.node_token, fetch: transport.fetch };
    const engine = new DriveSyncEngine({
      placementId: target.placementId,
      driveId: target.driveId,
      excluded: target.excluded,
      receiveOnly: target.receiveOnly,
      rootPath: target.localPath,
      platform: this.platform,
      portablePaths: this.platform === 'win32',
      database,
      socket: this.socket,
      hasher: this.hasher,
      meta: this.meta,
      source: new HubBlockSource(hub),
      uploader: new HubBlockUploader(hub),
      ignore: ignoreMatcherOf(target.ignorePatterns, this.platform),
      timings: ENGINE_TIMINGS,
      sink,
      log,
    });
    return this.handleOf(target.placementId, engine);
  }

  private handleOf(placementId: string, engine: DriveSyncEngine): EngineHandle {
    const unroute = this.router.route(placementId, engine.sink);
    return {
      start: () => engine.start(),
      stop: async (): Promise<void> => {
        await engine.stop();
        unroute();
      },
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      waiting: () => engine.waiting(),
      failures: (): number => engine.stateReport().errors.length,
    };
  }

  private changed(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      for (const listener of this.listeners) listener();
    }, NOTIFY_QUIET_MS);
    this.timer.unref();
  }
}

export function createComputerDrive(context: ComputerDriveContext): ComputerDrive {
  return new ComputerDrive(context);
}
