import {
  PROVIDER_TURN_MAX_BYTES,
  type ProviderTurn,
  type JsonValue,
  type ProviderReadQuery,
  type ComputerAiReply,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Logger } from '@smarteverything/logging';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type { ComputerAiModel } from '@smarteverything/domain';
import type { ProviderJob } from './job';
import { ProviderInputError } from './input';
import { jsonOf } from './control';
import { mcpStatusValue } from './mcp-status';
import { metadataOf } from './metadata';
import { nativeSubscriptionBilling } from './billing';
import type { ProviderMetadata } from '@smarteverything/domain';
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
  const billing = await nativeSubscriptionBilling(runtime);
  return (await runtime.supportedModels()).map((model) => ({
    device_id: deviceId,
    id: model.value,
    resolved_model: model.resolvedModel ?? null,
    name: model.displayName,
    description: model.description,
    efforts: model.supportedEffortLevels ?? [],
    adaptive_thinking: model.supportsAdaptiveThinking === true,
    fast: model.supportsFastMode === true,
    available: false,
    reason: billing.reason,
  }));
}
export async function jobMetadata(job: ProviderJob): Promise<ProviderMetadata> {
  const metadata = await metadataOf(job.query, job.commands);
  return { ...metadata, initialization: { ...metadata.initialization, session: job.metadata() } };
}
export function closeProbe(discovery: Promise<Query> | null, log: Logger): void {
  if (discovery !== null)
    void discovery.then(
      (runtime): void => {
        runtime.close();
      },
      (cause: unknown): void => {
        log.error('provider.discovery_failed', cause);
      },
    );
}

const DISCOVERY_BILLING = z.discriminatedUnion('state', [
  z.object({ state: z.literal('eligible') }),
  z.object({ state: z.literal('blocked'), reason: z.string().min(1) }),
]);
export function providerDiscoveryReason(reply: ComputerAiReply): string | null {
  if (reply.operation === 'models') {
    if (reply.value.some((model) => model.available)) return null;
    for (const model of reply.value) if (model.reason !== null) return model.reason.slice(0, 500);
    return 'No Claude model has verified included-only readiness.';
  }
  if (reply.operation !== 'provider_metadata')
    throw new ProviderInputError('Claude provider readiness requires model or metadata discovery.');
  const billing = DISCOVERY_BILLING.safeParse(reply.value.initialization['billing_guard']);
  if (!billing.success) return 'Claude included-only readiness could not be verified.';
  return billing.data.state === 'eligible' ? null : billing.data.reason.slice(0, 500);
}
