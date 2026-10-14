import type { NodeHubTransport } from '../client-network/node-transport';
import type { Logger } from '@smarteverything/logging';
import type { NodeServiceConfig } from '../service/configuration';
import { adaptClaudeHost, type ComputerRuntimeHost } from '../computers/runtime-host';
import { createCodexHost } from '../codex/host';
import { createNodeClaudeHost } from './claude-host';
import { NodeCodexGrant } from './codex-grant';
interface NodeRuntimeHostOptions {
  readonly dataDirectory: string;
  readonly node: NodeServiceConfig['node'];
  readonly log: Logger;
  readonly transport?: NodeHubTransport;
}
export async function nodeRuntimeHosts(
  options: NodeRuntimeHostOptions,
): Promise<readonly ComputerRuntimeHost[]> {
  const { node } = options;
  const claude = adaptClaudeHost(
    await createNodeClaudeHost({
      dataDirectory: options.dataDirectory,
      deviceId: node.device_id,
      hubUrl: node.hub_url,
      token: node.node_token,
      log: options.log,
      ...(options.transport === undefined ? {} : { transport: options.transport }),
      ...(node.claude_executable === undefined ? {} : { executable: node.claude_executable }),
    }),
  );
  try {
    const grant = new NodeCodexGrant({
      hubUrl: node.hub_url,
      token: node.node_token,
      ...(options.transport === undefined
        ? {}
        : {
            fetcher: options.transport.fetch,
            ...(options.transport.mcp === undefined ? {} : { mcp: options.transport.mcp }),
          }),
    });
    const codex = createCodexHost({
      dataDirectory: options.dataDirectory,
      deviceId: node.device_id,
      log: options.log,
      nativeMcpGrant: grant,
      ...(node.codex_executable === undefined ? {} : { executable: node.codex_executable }),
      ...(node.codex_control_socket === undefined
        ? {}
        : { controlSocket: node.codex_control_socket }),
    });
    return [claude, mcpRuntimeHost(codex, grant)];
  } catch (cause) {
    claude.stop();
    throw cause;
  }
}

function mcpRuntimeHost(host: ComputerRuntimeHost, grant: NodeCodexGrant): ComputerRuntimeHost {
  return {
    runtime: host.runtime,
    read: (request) => host.read(request),
    execute: (request) => host.execute(request),
    onEvent: (listener) => host.onEvent(listener),
    stop: (): void => {
      grant.stop();
      host.stop();
    },
  };
}
