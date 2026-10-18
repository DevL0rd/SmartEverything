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
  AiAgentRun,
  AiChatRow,
  HarnessTransportRequest,
  HarnessSkillAsset,
  DshEngine,
  HarnessPluginMetadata,
} from '@smarteverything/domain';
import { readHarnessPluginAgent, HARNESS_CLAUDE_PLUGINS_PACKAGE } from '@smarteverything/harness';
import type { HarnessHubTools } from './tools';
import type { HarnessService } from './service';
import type { AssistantService } from '../assistant/service';
import type { ToolCaller } from '../ai-tools/hub-tool';
import { withExecutionAuthority } from '../assistant/turn-authority';
import type { ConversationAuthority } from './authority-contract';
import { awaitPluginResult } from './plugin-agent-result';
import { currentRequestSignal } from '../server/request-signal';

export type PluginAgentRequest = Extract<
  HarnessTransportRequest['request'],
  { operation: 'plugin_agent' | 'plugin_agent_control' }
>;
type StartRequest = Extract<PluginAgentRequest, { operation: 'plugin_agent' }>;
export interface PluginAgentPorts {
  readonly service: HarnessService;
  readonly access: HarnessHubTools;
  readonly assistant: AssistantService;
}
const CHILD = z.strictObject({
  parent_chat: z.uuid(),
  profile_id: z.uuid(),
  event_id: z.uuid(),
  policy: HARNESS_PLUGIN_AGENT_POLICY,
});
type Result = z.infer<typeof HARNESS_PLUGIN_AGENT_RESULT>;
const INPUT = z.strictObject({ prompt: z.string().min(1).max(16_000) });
const CONFIG = z.object({
  agent_model_policy: z.enum(['inherit', 'source']).default('inherit'),
  model_routes: z
    .record(z.string(), z.strictObject({ provider: z.uuid(), model: z.string().min(1).max(200) }))
    .default({}),
});
interface Helper {
  readonly caller: ToolCaller;
  readonly authority: ConversationAuthority;
  readonly parent: AiChatRow;
}

export async function pluginAgentTransport(
  ports: PluginAgentPorts,
  request: PluginAgentRequest,
  signal: AbortSignal | undefined = currentRequestSignal(),
): Promise<Result> {
  const { service, access } = ports;
  const caller = access.caller(request.claim.session_id);
  if (caller.chatId === null)
    throw new ApiError('forbidden', 'Helpers require their current initiating conversation.');
  const parent = service.own({ profileId: caller.profileId, role: caller.role }, caller.chatId);
  if (request.operation === 'plugin_agent') {
    if (caller.authority === undefined)
      throw new ApiError('forbidden', 'Helpers require their current initiating conversation.');
    return startHelper(ports, request, { caller, authority: caller.authority, parent });
  }
  if (request.action === 'cancel') {
    await cancelHelper(ports, ownedRun(service, request.run_id, parent.id), caller);
    return result(service, request.run_id);
  }
  return helperResult(service, { parent: parent.id, run: request.run_id }, signal);
}
function ownedRun(service: HarnessService, runId: string, parentId: string): AiAgentRun {
  const run = service.store.aiAgentRuns.read(runId);
  if (run.parent_chat_id !== parentId)
    throw new ApiError('forbidden', 'This helper belongs to another conversation.');
  return run;
}
export async function helperResult(
  service: HarnessService,
  ids: { readonly parent: string; readonly run: string },
  signal: AbortSignal | undefined,
): Promise<Result> {
  const run = ownedRun(service, ids.run, ids.parent);
  await awaitPluginResult(service, run.id, signal);
  return result(service, run.id);
}
async function startHelper(
  ports: PluginAgentPorts,
  request: StartRequest,
  helper: Helper,
): Promise<Result> {
  const { service, access, assistant } = ports;
  const { caller, authority, parent } = helper;
  const { args, policy } = await helperPlan(ports, request, parent);
  access.authorizeCall(request.claim.session_id, 'subagent_run', { chatId: parent.id, ...args });
  const accepted = await withExecutionAuthority(authority, () =>
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
        persistHelperPolicy(
          service,
          { caller, parent, policy, session: request.claim.session_id },
          child,
          eventId,
        );
      },
    ),
  );
  return result(service, accepted.eventId);
}
function persistHelperPolicy(
  service: HarnessService,
  input: {
    readonly caller: ToolCaller;
    readonly parent: AiChatRow;
    readonly policy: z.infer<typeof HARNESS_PLUGIN_AGENT_POLICY>;
    readonly session: string;
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
  service.store.harnessCoordination.begin(`plugin-child:${child.id}`, input.session, marker);
  service.store.harnessCoordination.finish(`plugin-child:${child.id}`, marker);
}
interface HelperPlan {
  readonly args: z.infer<typeof AI_SUBAGENT>;
  readonly policy: z.infer<typeof HARNESS_PLUGIN_AGENT_POLICY>;
}
async function helperPlan(
  ports: PluginAgentPorts,
  request: StartRequest,
  parent: AiChatRow,
): Promise<HelperPlan> {
  const body = INPUT.parse(request.arguments);
  const binding = ports.service.binding(parent);
  const selected = appliedPackage(ports.service, request);
  const [installed] = await ports.service.extensions.assets.acquireAll('plugin', [selected.asset]);
  if (installed === undefined)
    throw new ApiError('conflict', 'This helper package is unavailable.');
  const helper = await readHarnessPluginAgent(installed, request.helper);
  const config = CONFIG.parse(selected.config);
  const engine = helperEngine(config, helper, binding);
  const args = AI_SUBAGENT.parse({
    task: body.prompt,
    title: helper.name,
    wait: false,
    timeoutSeconds: 300,
    engine,
  });
  return { args, policy: { persona: helper.body } };
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
async function cancelHelper(
  ports: PluginAgentPorts,
  run: AiAgentRun,
  caller: ToolCaller,
): Promise<void> {
  if (
    !['queued', 'running'].includes(run.state) ||
    ports.assistant.coordination.cancelQueuedChild(run.id) ||
    run.child_chat_id === null
  )
    return;
  const child = ports.service.store.aiChats.chat(run.child_chat_id);
  await ports.assistant.interrupt({ profileId: child.profile_id, role: caller.role }, child.id);
}
function appliedPackage(
  service: HarnessService,
  request: StartRequest,
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
  request: StartRequest,
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
function result(service: HarnessService, runId: string): Result {
  const run = service.store.aiAgentRuns.read(runId);
  if (run.child_chat_id === null)
    throw new ApiError('conflict', 'This helper has no conversation yet.');
  return HARNESS_PLUGIN_AGENT_RESULT.parse({
    child_id: run.child_chat_id,
    run_id: run.id,
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
