import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import {
  ApiError,
  AI_SUBAGENT,
  HARNESS_PLUGIN_AGENT_POLICY,
  HARNESS_PLUGIN_AGENT_RESULT,
  harnessTargetKey,
} from '@smarteverything/domain';
import type {
  AiChatRow,
  HarnessTransportRequest,
  HarnessSkillAsset,
  DshEngine,
  HarnessPluginMetadata,
} from '@smarteverything/domain';
import {
  sharedHarnessSkillAssets,
  readHarnessPluginAgent,
  HARNESS_CLAUDE_PLUGINS_PACKAGE,
} from '@smarteverything/harness';
import type { HarnessHubTools } from './tools';
import type { HarnessService } from './service';
import type { AssistantService } from '../assistant/service';
import type { ToolCaller } from '../ai-tools/hub-tool';
import { withExecutionAuthority } from '../assistant/execution-authority';
import { admitCanonicalTool } from './canonical-tools';
import { awaitPluginResult } from './plugin-agent-result';
import { currentRequestSignal } from '../server/request-signal';

export type PluginAgentRequest = Extract<
  HarnessTransportRequest['request'],
  { operation: 'plugin_agent' }
>;
export interface PluginAgentPorts {
  readonly service: HarnessService;
  readonly access: HarnessHubTools;
  readonly assistant: AssistantService;
  readonly stateDirectory: string;
}
const CHILD = z.strictObject({
  parent_chat: z.uuid(),
  profile_id: z.uuid(),
  event_id: z.uuid(),
  policy: HARNESS_PLUGIN_AGENT_POLICY,
});
const ACCEPTED = z.object({ child_id: z.uuid(), run_id: z.uuid() });
type Accepted = z.infer<typeof ACCEPTED>;
type Result = z.infer<typeof HARNESS_PLUGIN_AGENT_RESULT>;
const INPUT = z.strictObject({ prompt: z.string().min(1).max(16_000) });
const CONFIG = z.object({
  agent_model_policy: z.enum(['inherit', 'source']).default('inherit'),
  model_routes: z
    .record(z.string(), z.strictObject({ provider: z.uuid(), model: z.string().min(1).max(200) }))
    .default({}),
});

export async function pluginAgentTransport(
  ports: PluginAgentPorts,
  request: PluginAgentRequest,
  signal: AbortSignal | undefined = currentRequestSignal(),
): Promise<Result> {
  const { service, access } = ports;
  const caller = access.caller(request.claim.session_id);
  if (caller.chatId === null || caller.authority === undefined)
    throw new ApiError('forbidden', 'Helpers require their current initiating conversation.');
  const parent = service.own({ profileId: caller.profileId, role: caller.role }, caller.chatId);
  if (request.action === 'start') return startHelper(ports, request, caller, parent);
  access.authorizeCall(request.claim.session_id, 'subagent_run', {
    chatId: parent.id,
    task: INPUT.parse(request.arguments).prompt,
    wait: false,
    timeoutSeconds: 300,
  });
  const accepted = admittedHelper(service, request, caller, parent);
  const run = service.store.aiAgentRuns.read(accepted.run_id);
  if (run.parent_chat_id !== parent.id || run.child_chat_id !== accepted.child_id)
    throw new ApiError('forbidden', 'The helper child lineage changed.');
  if (request.action === 'cancel') await cancelHelper(ports, accepted, caller);
  if (request.action === 'result') await awaitPluginResult(service, accepted.run_id, signal);
  return result(service, accepted);
}
function receiptKey(request: PluginAgentRequest): string {
  return `plugin-agent:${request.claim.session_id}:${String(request.call_seq)}:${request.call_id}`;
}
async function startHelper(
  ports: PluginAgentPorts,
  request: PluginAgentRequest,
  caller: ToolCaller,
  parent: AiChatRow,
): Promise<Result> {
  const { service, access, assistant } = ports;
  if (request.name !== `subagent_${request.helper}`)
    throw new ApiError('forbidden', 'Helper source differs from the native tool identity.');
  admitCanonicalTool(service, request);
  const plan = await helperPlan(ports, request, parent);
  const { args, policy } = plan;
  access.authorizeCall(request.claim.session_id, 'subagent_run', { chatId: parent.id, ...args });
  const key = receiptKey(request);
  const canonical = canonicalHelperSource(request, caller, parent, plan);
  const receipt = service.store.harnessCoordination.begin(key, request.claim.session_id, canonical);
  if (receipt.state === 'completed' && receipt.result !== null)
    return result(service, ACCEPTED.parse(JSON.parse(receipt.result)));
  if (receipt.state === 'unknown')
    throw new ApiError(
      'conflict',
      'The helper admission outcome is unknown and cannot be replayed.',
    );
  if (caller.authority === undefined)
    throw new ApiError('forbidden', 'Helper initiating authority is unavailable.');
  service.store.harnessCoordination.finish(key, { state: 'admitted' }, 'unknown');
  const accepted = await withExecutionAuthority(caller.authority, () =>
    assistant.coordination.subagent(
      {
        owner: { profileId: caller.profileId, role: caller.role },
        chatId: parent.id,
        clientId: caller.clientId,
        plugin: null,
      },
      parent.id,
      args,
      (child, eventId): void => {
        persistHelperChild(service, { caller, parent, request, key, policy }, child, eventId);
      },
    ),
  );
  return result(service, { child_id: accepted.chatId, run_id: accepted.eventId });
}
function persistHelperChild(
  service: HarnessService,
  input: {
    readonly caller: ToolCaller;
    readonly parent: AiChatRow;
    readonly request: PluginAgentRequest;
    readonly key: string;
    readonly policy: z.infer<typeof HARNESS_PLUGIN_AGENT_POLICY>;
  },
  child: AiChatRow,
  eventId: string,
): void {
  const marker = CHILD.parse({
    parent_chat: input.parent.id,
    profile_id: input.caller.profileId,
    event_id: eventId,
    policy: input.policy,
  });
  service.store.harnessCoordination.begin(
    `plugin-child:${child.id}`,
    input.request.claim.session_id,
    marker,
  );
  service.store.harnessCoordination.finish(`plugin-child:${child.id}`, marker);
  service.store.harnessCoordination.finish(input.key, { child_id: child.id, run_id: eventId });
}
interface HelperPlan {
  readonly args: z.infer<typeof AI_SUBAGENT>;
  readonly policy: z.infer<typeof HARNESS_PLUGIN_AGENT_POLICY>;
  readonly source: HarnessSkillAsset;
  readonly sourceModel: string;
  readonly modelPolicy: string;
}
function canonicalHelperSource(
  request: PluginAgentRequest,
  caller: ToolCaller,
  parent: AiChatRow,
  plan: HelperPlan,
): Readonly<Record<string, unknown>> {
  return {
    ...request,
    action: 'start',
    profile_id: caller.profileId,
    parent_chat: parent.id,
    source: plan.source,
    model_policy: plan.modelPolicy,
    requested_model: plan.sourceModel,
  };
}
async function helperPlan(
  ports: PluginAgentPorts,
  request: PluginAgentRequest,
  parent: AiChatRow,
): Promise<HelperPlan> {
  const body = INPUT.parse(request.arguments);
  const binding = ports.service.binding(parent);
  const selected = appliedPackage(ports.service, request);
  const installed = await sharedHarnessSkillAssets(ports.stateDirectory).acquire(selected.asset);
  const helper = await readHarnessPluginAgent(installed, request.helper);
  const config = CONFIG.parse(selected.config);
  const engine = helperEngine(config, helper, binding);
  if ((helper.tools?.length ?? 0) > 0)
    throw new ApiError(
      'conflict',
      `Helper ${helper.name} requires source tool aliases that this runtime cannot enforce completely.`,
    );
  const args = AI_SUBAGENT.parse({
    task: body.prompt,
    title: helper.name,
    wait: false,
    timeoutSeconds: 300,
    engine,
  });
  return {
    args,
    policy: { persona: helper.body },
    source: selected.asset,
    sourceModel: helper.model ?? 'inherit',
    modelPolicy: config.agent_model_policy,
  };
}
function helperEngine(
  config: z.infer<typeof CONFIG>,
  helper: Awaited<ReturnType<typeof readHarnessPluginAgent>>,
  binding: DshEngine,
): DshEngine {
  if (
    config.agent_model_policy === 'inherit' ||
    helper.model === undefined ||
    helper.model === 'inherit'
  )
    return binding;
  const route = config.model_routes[helper.model];
  if (route === undefined)
    throw new ApiError(
      'conflict',
      `Helper ${helper.name} requires an explicitly configured ${helper.model} model route.`,
    );
  if (route.provider !== binding.model_route_id)
    throw new ApiError('forbidden', 'A helper cannot change its parent supplier route.');
  return { ...binding, model: route.model };
}
function admittedHelper(
  service: HarnessService,
  request: PluginAgentRequest,
  caller: ToolCaller,
  parent: AiChatRow,
): Accepted {
  const receipt = service.store.harnessCoordination.operation(receiptKey(request));
  if (receipt?.state !== 'completed' || receipt.result === null)
    throw new ApiError('conflict', 'The exact helper admission receipt is unavailable.');
  const original = z
    .object({
      profile_id: z.uuid(),
      parent_chat: z.uuid(),
      configuration_revision: z.string(),
      name: z.string(),
      helper: z.string(),
      asset_id: z.string(),
      arguments: z.record(z.string(), z.unknown()),
    })
    .parse(JSON.parse(receipt.request));
  const expected = {
    profile_id: caller.profileId,
    parent_chat: parent.id,
    configuration_revision: request.configuration_revision,
    name: request.name,
    helper: request.helper,
    asset_id: request.asset_id,
    arguments: request.arguments,
  };
  if (!isDeepStrictEqual(original, expected))
    throw new ApiError(
      'forbidden',
      'The helper control differs from its admitted source and call.',
    );
  return ACCEPTED.parse(JSON.parse(receipt.result));
}
async function cancelHelper(
  ports: PluginAgentPorts,
  accepted: Accepted,
  caller: ToolCaller,
): Promise<void> {
  const run = ports.service.store.aiAgentRuns.read(accepted.run_id);
  if (
    !['queued', 'running'].includes(run.state) ||
    ports.assistant.coordination.cancelQueuedChild(accepted.run_id)
  )
    return;
  const child = ports.service.store.aiChats.chat(accepted.child_id);
  await ports.assistant.interrupt({ profileId: child.profile_id, role: caller.role }, child.id);
}
function appliedPackage(
  service: HarnessService,
  request: PluginAgentRequest,
): { readonly asset: HarnessSkillAsset; readonly config: unknown } {
  const applied = appliedHostPackage(service, request);
  const desired = service.store.harnessConfiguration.readRevision(request.configuration_revision);
  const entry = desired?.entries.find(
    (item) => item.package === HARNESS_CLAUDE_PLUGINS_PACKAGE && item.enabled,
  );
  if (entry === undefined)
    throw new ApiError('conflict', 'This helper configuration is unavailable.');
  if (applied.state === 'ready' && applied.revision !== request.configuration_revision)
    throw new ApiError(
      'conflict',
      'The helper configuration revision differs from the applied host.',
    );
  if (!isDeepStrictEqual(entry.metadata, applied.metadata))
    throw new ApiError(
      'conflict',
      'The helper configuration metadata differs from the retained host package.',
    );
  const asset = applied.metadata.skill_assets.find((item) => item.id === request.asset_id);
  if (asset === undefined)
    throw new ApiError(
      'conflict',
      'This helper source is not the current applied verified package.',
    );
  return { asset, config: entry.config };
}
function appliedHostPackage(
  service: HarnessService,
  request: PluginAgentRequest,
): { readonly revision: string; readonly state: string; readonly metadata: HarnessPluginMetadata } {
  const grant = service.storage.grant(request.claim.session_id);
  const report = service.store.harnessConfiguration
    .reports()
    .find(
      (item) =>
        harnessTargetKey(item.target) === harnessTargetKey(grant.target) &&
        item.runtime_instance === grant.runtime_instance &&
        item.connection_generation === grant.generation,
    );
  if (report === undefined)
    throw new ApiError('conflict', 'The execution host has no applied package report.');
  const ready = report.readiness.find(
    (item) =>
      item.package === HARNESS_CLAUDE_PLUGINS_PACKAGE &&
      (item.state === 'ready' || item.state === 'failed'),
  );
  if (ready?.installedMetadata === undefined || ready.installedMetadata === null)
    throw new ApiError('conflict', 'The execution host has no retained verified package.');
  return { revision: report.revision, state: ready.state, metadata: ready.installedMetadata };
}
function result(service: HarnessService, accepted: Accepted): Result {
  const run = service.store.aiAgentRuns.read(accepted.run_id);
  return HARNESS_PLUGIN_AGENT_RESULT.parse({
    ...accepted,
    state: run.state === 'stopped' ? 'interrupted' : run.state,
    text: run.result ?? run.error,
  });
}
export function pluginChildPolicy(
  service: HarnessService,
  child: AiChatRow,
): z.infer<typeof HARNESS_PLUGIN_AGENT_POLICY> | undefined {
  const receipt = service.store.harnessCoordination.operation(`plugin-child:${child.id}`);
  if (receipt === undefined) return undefined;
  if (receipt.state !== 'completed')
    throw new ApiError('conflict', 'Helper policy admission is incomplete.');
  const marker = CHILD.parse(JSON.parse(receipt.request));
  if (marker.profile_id !== child.profile_id || marker.parent_chat !== child.parent_id)
    throw new ApiError('forbidden', 'Helper policy belongs to another parent.');
  return marker.policy;
}
