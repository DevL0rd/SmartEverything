import { HubGuestBroker } from '../client-network/guest-broker';
import { NodeRouteAuthority } from '../client-network/route-authority';
import { nodeHubTransport, type NodeHubTransport } from '../client-network/node-transport';
import { pid } from 'node:process';
import type { Logger } from '@smarteverything/logging';
import type { NodeServiceConfig } from '../service/configuration';
import { writeReadyFile, type ReadyFile } from '../service/files';
import { HUB_VERSION } from '../version';
import { NodeHarnessRuntime } from './harness-runtime';
import { NodeAiRuntime } from './ai-runtime';
import { nodeIdentity } from './identity';
import { nodeRuntimeHosts } from './runtime-hosts';
import { collectorFor, UnsupportedPlatformError } from './collectors/collector';
import { ComputerNode } from './computer-node';
import { controlsFor } from './controls/controls';
import { earHostFor, type EarHostFactory } from './ear/ear-host';
import { computerEarFor } from './ear/linux-ear';
import type { NodeLink } from './link';
import { NodeFailureError } from './node-failure';

interface NodeBootstrapOptions {
  readonly dataDirectory: string;
  readonly config: NodeServiceConfig;
  readonly log: Logger;
}
export interface RunningNode {
  readonly role: 'node';
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
        this.ready = await writeReadyFile(this.options.dataDirectory, {
          role: 'node',
          pid,
          version: HUB_VERSION,
          hub_url: this.options.config.node.hub_url,
          device_id: this.options.config.node.device_id,
          connected,
        });
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

export async function startNode(options: NodeBootstrapOptions): Promise<RunningNode> {
  const { node } = options.config;

  const identity = await nodeIdentity(options.dataDirectory);
  const authority = new NodeRouteAuthority({
    hubUrl: node.hub_url,
    token: node.node_token,
    deviceId: node.device_id,
    directory: options.dataDirectory,
    log: options.log.forArea('hub.node-route'),
  });
  await authority.start();
  const { broker, transport } = await startNodeTransport(authority, node.hub_url);
  const ready = new NodeReadyWriter(options);
  const harness = new NodeHarnessRuntime({
    node,
    dataDirectory: options.dataDirectory,
    machineId: identity.machineId,
    name: identity.hostname,
    log: options.log.forArea('hub.node-harness'),
    transport,
  });
  const runtime = createRuntime(options, ready, identity, transport);
  ready.changed(false);
  runtime.start();
  harness.start();
  return Promise.resolve({
    role: 'node',
    url: node.hub_url,
    stop: async (): Promise<void> => {
      runtime.stop();
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
  transport: NodeHubTransport,
): NodeAiRuntime {
  const { node } = options.config;
  const earHost = earHostFor({ now: (): Date => new Date(), log: options.log });
  return new NodeAiRuntime({
    hubUrl: node.hub_url,
    transport,
    token: node.node_token,
    deviceId: node.device_id,
    hello: identity,
    log: options.log,
    runtimes: ['claude', 'codex'],
    createRuntimeHosts: (): ReturnType<typeof nodeRuntimeHosts> =>
      nodeRuntimeHosts({ dataDirectory: options.dataDirectory, node, log: options.log, transport }),
    createComputer: (link) => createComputerNode(options.log, link, earHost, identity.machineId),
    changed: (connected): void => {
      ready.changed(connected);
    },
  });
}

function createComputerNode(
  log: Logger,
  link: NodeLink,
  earHost: EarHostFactory,
  machineId: string,
): ComputerNode | null {
  const now = (): Date => new Date();
  try {
    return new ComputerNode({
      collector: collectorFor(process.platform, { log, machineId, now: Date.now }),
      controls: controlsFor(process.platform, { now, log }),
      link,
      now,
      log,
      ear: computerEarFor(process.platform, { now, log }),
      earHost,
    });
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
    endpoint: (runtime, url, token): string => broker.openMcp(runtime, url, token),
    revoke: (runtime): void => {
      broker.closeOwner(`mcp:${runtime}`);
    },
  });
  return { broker, transport };
}
