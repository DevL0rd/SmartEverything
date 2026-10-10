import type { Stream } from 'node:stream';
import { StreamableHTTPClientTransport, type Transport } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import type { PluginManifest, PluginMcp, PluginRow } from '@smarteverything/domain';
import { filledIn, filledRecord, type PlaceholderValues } from './placeholders';
import { sandboxed, type Launch } from './sandbox';

export interface Connection {
  readonly transport: Transport;
  readonly stderr: Stream | null;
}

export interface ConnectionPlan {
  readonly row: PluginRow;
  readonly values: PlaceholderValues;
  readonly callback: Readonly<Record<string, string>>;
}

type StdioMcp = Extract<PluginMcp, { transport: 'stdio' }>;

type HttpMcp = Extract<PluginMcp, { transport: 'http' }>;

function launchOf(mcp: StdioMcp, plan: ConnectionPlan, cwd: string): Launch {
  const command = filledIn(mcp.command, plan.values);
  const args = mcp.args.map((arg) => filledIn(arg, plan.values));
  if (plan.row.trusted) {
    return { command, args };
  }
  return sandboxed({
    command,
    args,
    cwd,
    home: plan.values.home,
    data: plan.values.data,
    permissions: plan.row.manifest.permissions,
  });
}

function stdioConnection(mcp: StdioMcp, plan: ConnectionPlan): Connection {
  const cwd =
    mcp.cwd === null ? (plan.row.location ?? plan.values.data) : filledIn(mcp.cwd, plan.values);
  const launch = launchOf(mcp, plan, cwd);
  const transport = new StdioClientTransport({
    command: launch.command,
    args: [...launch.args],
    env: { ...getDefaultEnvironment(), ...filledRecord(mcp.env, plan.values), ...plan.callback },
    cwd,
    stderr: 'pipe',
  });
  return { transport, stderr: transport.stderr };
}

function httpConnection(mcp: HttpMcp, plan: ConnectionPlan): Connection {
  const headers: Record<string, string> =
    mcp.bearer === null ? {} : { authorization: `Bearer ${filledIn(mcp.bearer, plan.values)}` };
  return {
    transport: new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers } }),
    stderr: null,
  };
}

export function connectionFor(manifest: PluginManifest, plan: ConnectionPlan): Connection | null {
  const mcp = manifest.mcp;
  if (mcp === null) {
    return null;
  }
  return mcp.transport === 'stdio' ? stdioConnection(mcp, plan) : httpConnection(mcp, plan);
}
