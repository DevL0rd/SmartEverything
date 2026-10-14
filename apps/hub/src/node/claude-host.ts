import type { NodeHubTransport } from '../client-network/node-transport';
import { dirname, join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import type { ComputerAiHost } from '../computers/ai-host';
import { systemClock } from '../clock';
import { systemClaudeCli } from '../claude/claude-cli';
import { createClaudeHost } from '../claude/host';
import { LocalLinkCredential } from '../claude/local-credential';
import { helperCommand, linkLaunchOf } from '../claude/link-launch';
import { LinkPlane } from '../claude/link-plane';
import { startClaudeLoopback, type ClaudeLoopback } from '../claude/loopback';
import { claudeLocations } from '../claude/locations';
import { ClaudeService } from '../claude/service';
import { NodeClaudeGrant } from './claude-grant';

interface NodeClaudeHostOptions {
  readonly dataDirectory: string;
  readonly deviceId: string;
  readonly hubUrl: string;
  readonly token: string;
  readonly log: Logger;
  readonly transport?: NodeHubTransport;
  readonly executable?: string;
}

class NodeNativePlane {
  readonly plane: LinkPlane;
  readonly grant: NodeClaudeGrant;
  private loopback: Promise<ClaudeLoopback> | null = null;
  private stopped = false;

  constructor(private readonly options: NodeClaudeHostOptions) {
    const directory = join(options.dataDirectory, 'claude');
    const launch = linkLaunchOf(options.dataDirectory);
    this.grant = new NodeClaudeGrant({
      hubUrl: options.hubUrl,
      token: options.token,
      directory,
      ...(options.transport === undefined
        ? {}
        : {
            fetcher: options.transport.fetch,
            ...(options.transport.mcp === undefined ? {} : { mcp: options.transport.mcp }),
          }),
    });
    this.plane = new LinkPlane({
      credential: new LocalLinkCredential(directory),
      clock: systemClock,
      log: options.log,
      directory,
      launch,
      cli: systemClaudeCli,
      readUrl: async (): Promise<string> => (await this.connect()).url,
      readMcp: async (): Promise<{ url: string | null; headersCommand: string }> => ({
        url: await this.grant.endpoint(),
        headersCommand: helperCommand(launch, 'mcp-headers'),
      }),
      pluginsDirectory: join(dirname(claudeLocations().sessions), 'plugins'),
      raised: (): void => undefined,
    });
  }

  async connect(): Promise<ClaudeLoopback> {
    if (this.stopped) throw new NodeClaudeHostError('The attached CLI transport stopped.');
    const pending = (this.loopback ??= this.start());
    try {
      return await pending;
    } catch (cause) {
      if (this.loopback === pending) this.loopback = null;
      throw cause;
    }
  }

  private async start(): Promise<ClaudeLoopback> {
    await this.plane.token.ensure();
    const loopback = await startClaudeLoopback({
      plane: this.plane,
      directory: join(this.options.dataDirectory, 'claude'),
      log: this.options.log,
    });
    if (this.stopped) {
      await loopback.stop();
      throw new NodeClaudeHostError('The attached CLI transport stopped while starting.');
    }
    return loopback;
  }

  stop(): void {
    this.stopped = true;
    this.grant.stop();
    if (this.loopback === null) return;
    void this.loopback
      .then((loopback) => loopback.stop())
      .catch((cause: unknown) => {
        this.options.log.error('node.loopback_stop_failed', cause);
      });
  }
}

export function createNodeClaudeHost(options: NodeClaudeHostOptions): Promise<ComputerAiHost> {
  const native = new NodeNativePlane(options);
  const service = new ClaudeService({
    locations: claudeLocations(),
    historyDirectory: join(options.dataDirectory, 'claude'),
    plane: native.plane,
    clock: systemClock,
    log: options.log,
    publish: (): void => undefined,
  });
  service.start();
  const host = createClaudeHost({
    service,
    plane: native.plane,
    deviceId: options.deviceId,
    dataDirectory: options.dataDirectory,
    log: options.log,
    ...(options.executable === undefined ? {} : { executable: options.executable }),
  });
  return Promise.resolve(connectedHost(host, native));
}

function connectedHost(host: ComputerAiHost, native: NodeNativePlane): ComputerAiHost {
  let nativeEnabled = false;
  return {
    read: async (request): ReturnType<ComputerAiHost['read']> => {
      if (request.operation === 'native_tools_list' && nativeEnabled) await native.connect();
      return host.read(request);
    },
    execute: async (request): ReturnType<ComputerAiHost['execute']> => {
      if (request.operation === 'native_tools_call' && nativeEnabled) await native.connect();
      const result = await host.execute(request);
      if (request.operation === 'configure') nativeEnabled = request.settings.control.enabled;
      if (request.operation === 'remove_link') await native.grant.revoke();
      return result;
    },
    onEvent: (listener) => host.onEvent(listener),
    stop: (): void => {
      host.stop();
      native.stop();
    },
  };
}
class NodeClaudeHostError extends Error {
  override readonly name = 'NodeClaudeHostError';
}
