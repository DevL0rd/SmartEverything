import { HubGuestBroker } from '../client-network/guest-broker';
import { NodeRouteAuthority } from '../client-network/route-authority';
import { nodeHubTransport, type NodeHubTransport } from '../client-network/node-transport';
import { pid } from 'node:process';
import { COMPUTER_SERVICE_READY, type ComputerServiceConfig } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { NodeLayout } from '../data-layout';
import { writeReadyFile, type ReadyFile } from '../service/files';
import { startBundledWatchdog } from '../service/loop-watchdog/script';
import type { LoopWatchdog } from '../service/loop-watchdog/start';
import { COMPUTER_VERSION } from './computer-version';
import { NodeHarnessRuntime } from './harness-runtime';
import { NodeAiRuntime } from './ai-runtime';
import { nodeIdentity } from './identity';
import { nodeRuntimeHosts } from './runtime-hosts';
import { collectorFor, UnsupportedPlatformError } from './collectors/collector';
import { ComputerNode } from './computer-node';
import { controlsFor } from './controls/controls';
import type { EarHostFactory } from './ear/ear-host';
import type { EarPipelineFactory } from './ear/ear-pipeline';
import { computerEarFor } from './ear/linux-ear';
import { earHostFactoryOf, earProcessFor } from './ear/process/ear-process-for';
import type { NodeLink } from './link';
import { NodeLogShip } from './log-ship';
import { NodeFailureError } from './node-failure';
import type { PlacementLink } from './placement-link';
import { startNodeLogShipping } from './startup-journal';

export interface ComputerDriveContext {
  readonly layout: NodeLayout;
  readonly node: ComputerServiceConfig['node'];
  readonly transport: NodeHubTransport;
  readonly authority: NodeRouteAuthority;
  readonly log: Logger;
}

export interface ComputerDriveRuntime {
  readonly start: () => Promise<void>;
  readonly attach: (placements: PlacementLink) => void;
  readonly stop: () => Promise<void>;
}

export type ComputerDriveFactory = (context: ComputerDriveContext) => ComputerDriveRuntime;

interface NodeBootstrapOptions {
  readonly layout: NodeLayout;
  readonly config: ComputerServiceConfig;
  readonly log: Logger;
  readonly drive?: ComputerDriveFactory;
}
const NODE_STALL_EXIT_MS = 30_000;

export interface RunningNode {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

class NodeReadyWriter {
  private writing: Promise<void> = Promise.resolve();
  private ready: ReadyFile | null = null;
  private stopped = false;
  constructor(private readonly options: NodeBootstrapOptions) {}
  changed(connected: boolean): void {
    this.writing = this.writing
      .then(async () => {
        if (this.stopped) return;
        this.ready = await writeReadyFile(
          this.options.layout.ready,
          COMPUTER_SERVICE_READY.parse({
            pid,
            version: COMPUTER_VERSION,
            hub_url: this.options.config.node.hub_url,
            device_id: this.options.config.node.device_id,
            connected,
          }),
        );
      })
      .catch((cause: unknown) => {
        this.options.log.error('node.ready_write_failed', cause);
      });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    await this.writing;
    await this.ready?.remove();
  }
}

function nodeWatchdog(log: Logger, logPath: string): LoopWatchdog | null {
  return startBundledWatchdog({
    name: 'node',
    logPath,
    release: COMPUTER_VERSION,
    exitAfterMs: NODE_STALL_EXIT_MS,
    log,
  });
}

function nodeEars(
  options: NodeBootstrapOptions,
  logPath: string,
): ReturnType<typeof earProcessFor> {
  return earProcessFor({
    wakeDiagnosticsDirectory: options.config.wakeDiagnostics
      ? options.layout.logs.wakeDiagnostics
      : null,
    logPath,
    log: options.log,
  });
}

async function startAuthority(options: NodeBootstrapOptions): Promise<NodeRouteAuthority> {
  const { node } = options.config;
  const authority = new NodeRouteAuthority({
    hubUrl: node.hub_url,
    token: node.node_token,
    deviceId: node.device_id,
    directory: options.layout.nodeRoute,
    log: options.log.forArea('hub.node-route'),
  });
  await authority.start();
  return authority;
}

export async function startNode(options: NodeBootstrapOptions): Promise<RunningNode> {
  const { node } = options.config;

  const logPath = options.layout.logs.service;
  const watchdog = nodeWatchdog(options.log, logPath);
  const identity = await nodeIdentity(options.layout.computerNodeId);
  const authority = await startAuthority(options);
  const { broker, transport } = await startNodeTransport(authority, node.hub_url);
  const ready = new NodeReadyWriter(options);
  const harness = new NodeHarnessRuntime({
    node,
    stateDirectory: options.layout.harness,
    machineId: identity.machineId,
    name: identity.hostname,
    log: options.log.forArea('hub.node-harness'),
    transport,
  });
  const ears = nodeEars(options, logPath);
  const logs = new NodeLogShip();
  const drive = await startDrive(options, { transport, authority });
  const runtime = createRuntime(options, ready, identity, {
    transport,
    earHost: earHostFactoryOf(ears),
    pipeline: ears.pipeline,
    logs,
    drive,
  });
  const stopLogs = startNodeLogShipping(options.layout, node.device_id, logs, options.log);
  ready.changed(false);
  runtime.start();
  harness.start();
  return Promise.resolve({
    url: node.hub_url,
    stop: async (): Promise<void> => {
      watchdog?.stop();
      runtime.stop();
      await drive?.stop().catch((cause: unknown) => {
        options.log.error('node.drive_stop_failed', cause);
      });
      stopLogs();
      ears.stop();
      broker.close();
      await harness.stop();
      await authority.stop();
      await ready.stop();
    },
  });
}

function createRuntime(
  options: NodeBootstrapOptions,
  ready: NodeReadyWriter,
  identity: Awaited<ReturnType<typeof nodeIdentity>>,
  {
    transport,
    earHost,
    pipeline,
    logs,
    drive,
  }: {
    readonly transport: NodeHubTransport;
    readonly earHost: EarHostFactory;
    readonly pipeline: EarPipelineFactory;
    readonly logs: NodeLogShip;
    readonly drive: ComputerDriveRuntime | null;
  },
): NodeAiRuntime {
  const { node } = options.config;
  return new NodeAiRuntime({
    hubUrl: node.hub_url,
    transport,
    logs,
    token: node.node_token,
    deviceId: node.device_id,
    hello: identity,
    log: options.log,
    runtimes: ['claude', 'codex'],
    createRuntimeHosts: (): ReturnType<typeof nodeRuntimeHosts> =>
      nodeRuntimeHosts({ layout: options.layout, node, log: options.log, transport }),
    createComputer: (link) =>
      createComputerNode(options.log, link, identity.machineId, { earHost, pipeline, drive }),
    changed: (connected): void => {
      ready.changed(connected);
    },
  });
}

interface ComputerNodeParts {
  readonly earHost: EarHostFactory;
  readonly pipeline: EarPipelineFactory;
  readonly drive: ComputerDriveRuntime | null;
}

function createComputerNode(
  log: Logger,
  link: NodeLink,
  machineId: string,
  { earHost, pipeline, drive }: ComputerNodeParts,
): ComputerNode | null {
  const now = (): Date => new Date();
  try {
    const computer = new ComputerNode({
      collector: collectorFor(process.platform, { log, machineId, now: Date.now }),
      controls: controlsFor(process.platform, { now, log }),
      link,
      now,
      log,
      ear: computerEarFor(process.platform, { now, log, pipeline }),
      earHost,
    });
    drive?.attach(computer.placements);
    return computer;
  } catch (cause) {
    if (!(cause instanceof UnsupportedPlatformError || cause instanceof NodeFailureError))
      throw cause;
    log.warn('node.computer_unavailable', {
      reason: cause.message,
      consequence: 'readings, apps, processes, files and power are not available',
    });
    return null;
  }
}

async function startDrive(
  options: NodeBootstrapOptions,
  {
    transport,
    authority,
  }: { readonly transport: NodeHubTransport; readonly authority: NodeRouteAuthority },
): Promise<ComputerDriveRuntime | null> {
  const drive = options.drive?.({
    layout: options.layout,
    node: options.config.node,
    transport,
    authority,
    log: options.log.forArea('hub.node-drive'),
  });
  if (drive === undefined) return null;
  try {
    await drive.start();
    return drive;
  } catch (cause) {
    options.log.error('node.drive_start_failed', cause);
    await drive.stop().catch((stopCause: unknown) => {
      options.log.error('node.drive_stop_failed', stopCause);
    });
    return null;
  }
}

async function startNodeTransport(
  authority: NodeRouteAuthority,
  canonical: string,
): Promise<{
  readonly broker: HubGuestBroker;
  readonly transport: NodeHubTransport;
}> {
  const broker = new HubGuestBroker(authority, new URL(canonical).origin);
  try {
    await broker.start();
  } catch (cause) {
    await authority.stop();
    throw cause;
  }
  const transport = nodeHubTransport(authority, canonical, {
    endpoint: (runtime, address, token): string => broker.openMcp(runtime, address, token),
    revoke: (runtime): void => {
      broker.closeOwner(`mcp:${runtime}`);
    },
  });
  return { broker, transport };
}
