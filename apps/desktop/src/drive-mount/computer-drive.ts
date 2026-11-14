import { mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { env } from 'node:process';
import { join } from 'node:path';
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
import { DriveSyncEngine } from '../drive-sync/engine.js';
import { SyncPlacementIntake, type SyncTarget } from '../drive-sync/service.js';
import { SyncSocket, type SyncSocketTransport } from '../drive-sync/socket.js';
import { ignoreMatcherOf } from '../drive-sync/state.js';
import { HubBlockSource } from '../drive-sync/transfer.js';
import { nodeSystem } from '../service/system.js';
import { MountController } from './controller.js';
import { driveControlAddress } from './control-protocol.js';
import { DriveControlServer } from './control-server.js';
import { detectFuse, nodeFuseExists, recoverStaleMount, type FuseStatus } from './fuse-detect.js';
import { FirstRun } from './first-run.js';
import { HelperProcess, nodeSpawnHelper } from './helper-process.js';
import {
  CacheSettingsFile,
  helperCacheOf,
  helperRouteOf,
  routeWordOf,
  type HelperRouteSource,
} from './helper-settings.js';
import type { MountTray } from './mount-state.js';
import { FilePlacementCache } from './placement-cache.js';
import { nodePathFs, systemDirectories } from './placement-paths.js';
import { nodeReadText } from './placement-basic.js';
import type { RouteEndpointState } from './placement-state.js';
import { PlacementsController, type SubscribeHandlers } from './placements.js';
import { PlacementRelay, type PlacementFeed } from './relay-link.js';
import { SocketRouter } from './socket-router.js';
import { SyncEngineHost, type EngineHandle } from './sync-engines.js';
import { engineSinkOf } from './sync-sink.js';

const ENGINE_TIMINGS = {
  changeQuietMs: 1000,
  deleteHoldMs: 3000,
  queueLimit: null,
  writeQuietMs: 2000,
} as const;
const NOTIFY_QUIET_MS = 250;
const PLACEMENT_CACHE_FILE = 'drive-placements.json';
const FIRST_RUN_FILE = 'drive-first-run.json';
const CACHE_SETTINGS_FILE = 'drive-cache.json';
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
  private readonly firstRun: FirstRun;
  private readonly cacheSettings: CacheSettingsFile;
  private stopRoute: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly platform = process.platform;
  private readonly socket: SyncSocket;
  private readonly helper: HelperProcess;
  private readonly host: SyncEngineHost;
  private readonly intake: SyncPlacementIntake;
  private readonly controller: MountController;
  private readonly server: DriveControlServer;
  private readonly hasher: BlockHasher;
  private database: DriveSyncDatabase | null = null;
  private fuse: FuseStatus = { available: true };
  private mount: MountTray | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly context: ComputerDriveContext) {
    const { layout, node, transport, log } = context;
    this.cache = new FilePlacementCache(join(layout.root, PLACEMENT_CACHE_FILE), log);
    this.firstRun = new FirstRun({
      file: join(layout.root, FIRST_RUN_FILE),
      home: homedir(),
      mountable: this.platform === 'linux',
    });
    this.cacheSettings = new CacheSettingsFile(join(layout.root, CACHE_SETTINGS_FILE));
    this.socket = new SyncSocket({
      hubUrl: node.hub_url,
      token: node.node_token,
      transport,
      sink: this.router,
      log,
    });
    this.hasher = createBlockHasher({ workerFile: bundledBlockWorker(), log });
    this.host = new SyncEngineHost({
      create: (target, changed): EngineHandle => this.engineOf(target, changed),
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
    this.helper.configure(helperCacheOf(await this.cacheSettings.read()));
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
    return {
      mount: this.mount,
      sync: summary,
      fuse: this.fuse,
      firstRun: {
        pending: await this.firstRun.pending(this.cache.all()),
        defaultParent: this.firstRun.defaultParent,
      },
      cache: await this.cacheSettings.read(),
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
      case 'first-run-mounted':
        await this.firstRun.settle('mounted');
        this.changed();
        return;
      case 'first-run-dismissed':
        await this.firstRun.settle('dismissed');
        this.changed();
        return;
      case 'cache':
        await this.cacheSettings.write(command.cache);
        this.helper.configure(helperCacheOf(command.cache));
        this.changed();
        return;
      case 'again':
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
      known: () => this.cache.all(),
      helper: this.helper,
      link: this.relay,
      createPlacements: (ports) =>
        new PlacementsController({
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
          fs: nodePathFs,
          synced: (placements): void => {
            this.intake.accept(placements).catch((cause: unknown) => {
              log.error('drive_sync.intake_failed', cause);
            });
          },
          now: () => new Date(),
          log,
        }),
      clearCache: () => rm(layout.driveMountCache, { recursive: true, force: true }),
      tray: (state): void => {
        this.mount = state;
        this.changed();
      },
      log,
    });
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

  private engineOf(target: SyncTarget, changed: () => void): EngineHandle {
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
      source: new HubBlockSource(hub),
      uploader: new HubBlockUploader(hub),
      ignore: ignoreMatcherOf(target.ignorePatterns, this.platform),
      timings: ENGINE_TIMINGS,
      sink: engineSinkOf(target.placementId, changed, log),
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

export class DriveSyncNotStartedError extends Error {
  override readonly name = 'DriveSyncNotStartedError';

  constructor() {
    super('The sync database is not open');
  }
}

export function createComputerDrive(context: ComputerDriveContext): ComputerDrive {
  return new ComputerDrive(context);
}
