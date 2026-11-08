import {
  PROVIDER_TURN_MAX_BYTES,
  type ProviderTurn,
  type JsonValue,
  type ProviderReadQuery,
  type ComputerAiReply,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type { ComputerAiModel } from '@smarteverything/domain';
import type { ProviderJob } from './job';
import { ProviderInputError } from './input';
import { jsonOf } from './control';
import { mcpStatusValue } from './mcp-status';
import { metadataOf } from './metadata';
import type { ProviderMetadata } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
type ConnectionRead = Extract<ProviderReadQuery, { kind: 'account_info' | 'mcp_status' }>;
export function connectionReadRequest(request: ProviderReadQuery): request is ConnectionRead {
  return new Set(['account_info', 'mcp_status']).has(request.kind);
}
export function connectionRead(job: ProviderJob, request: ConnectionRead): Promise<JsonValue> {
  if (request.kind === 'account_info') return job.query.accountInfo().then(jsonOf);
  return job.query.mcpServerStatus().then(mcpStatusValue);
}

export function validateTurnSize(turn: ProviderTurn): void {
  if (Buffer.byteLength(JSON.stringify(turn), 'utf8') > PROVIDER_TURN_MAX_BYTES)
    throw new ProviderInputError('The serialized provider turn exceeds the node transport limit.');
}
export async function readModels(runtime: Query, deviceId: string): Promise<ComputerAiModel[]> {
  return (await runtime.supportedModels()).map((model) => ({
    device_id: deviceId,
    id: model.value,
    resolved_model: model.resolvedModel ?? null,
    name: model.displayName,
    description: model.description,
    efforts: model.supportedEffortLevels ?? [],
    adaptive_thinking: model.supportsAdaptiveThinking === true,
    fast: model.supportsFastMode === true,
    available: true,
    reason: null,
  }));
}
export async function jobMetadata(job: ProviderJob): Promise<ProviderMetadata> {
  const metadata = await metadataOf(job.query, job.commands);
  return { ...metadata, initialization: { ...metadata.initialization, session: job.metadata() } };
}
export function closeProbe(discovery: Promise<Query> | null, log: Logger): void {
  if (discovery !== null)
    background(
      discovery.then(
        (runtime): void => {
          runtime.close();
        },
        (cause: unknown): void => {
          log.error('provider.discovery_failed', cause);
        },
      ),
      'runtime_reads.background_failed',
    );
}

export function providerDiscoveryReason(reply: ComputerAiReply): string | null {
  if (reply.operation === 'models')
    return reply.value.length === 0 ? 'The Claude runtime reported no models.' : null;
  if (reply.operation === 'provider_metadata') return null;
  throw new ProviderInputError('Claude provider readiness requires model or metadata discovery.');
}
