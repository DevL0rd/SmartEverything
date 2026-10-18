import { pluginAgentTransport, type PluginAgentPorts } from './plugin-agents';
import type { AssistantService } from '../assistant/service';
import type { z } from 'zod';
import { ApiError, HARNESS_CENTRAL_CONTEXT } from '@smarteverything/domain';
import type { HarnessTransportRequest } from '@smarteverything/domain';
import type { HarnessService } from './service';
import type { HarnessHubTools } from './tools';
import { harnessPrompt } from './prompt';

interface CentralPorts {
  readonly access: HarnessHubTools;
  readonly now: () => Date;
}
interface HelperPorts {
  readonly assistant: AssistantService;
}
const ports = new WeakMap<HarnessService, CentralPorts>();
const helperPorts = new WeakMap<HarnessService, HelperPorts>();
export function bindCentralHarness(
  service: HarnessService,
  access: HarnessHubTools,
  now: () => Date,
): void {
  ports.set(service, { access, now });
}
export function bindPluginAgents(service: HarnessService, helpers: HelperPorts): void {
  helperPorts.set(service, helpers);
}
function centralPorts(service: HarnessService): CentralPorts {
  const installed = ports.get(service);
  if (installed === undefined)
    throw new ApiError('conflict', 'Central native tool access is not installed.');
  return installed;
}
function pluginAgentPorts(service: HarnessService): PluginAgentPorts {
  const installed = helperPorts.get(service);
  if (installed === undefined) throw new ApiError('conflict', 'Plugin helpers are not installed.');
  return { service, access: centralPorts(service).access, ...installed };
}
export function centralCatalogue(
  service: HarnessService,
): ReturnType<HarnessHubTools['catalogue']> {
  return centralPorts(service).access.catalogue();
}
export async function centralTransport(
  service: HarnessService,
  input: HarnessTransportRequest,
): Promise<unknown> {
  const request = input.request;
  if (request.operation === 'context') {
    service.storage.verify(request.claim, input);
    return centralContext(service, request.claim.session_id);
  }
  if (request.operation === 'tool') {
    service.storage.verify(request.claim, input);
    const { access } = centralPorts(service);
    const authorized = access.authorizeCall(
      request.claim.session_id,
      request.name,
      request.arguments,
    );
    return access.transportCall(authorized, request.name, request.arguments);
  }
  if (request.operation === 'plugin_agent' || request.operation === 'plugin_agent_control') {
    service.storage.verify(request.claim, input);
    return pluginAgentTransport(pluginAgentPorts(service), request);
  }
  throw new ApiError('invalid_request', 'Expected scoped central native access.');
}
function centralContext(
  service: HarnessService,
  id: string,
): z.infer<typeof HARNESS_CENTRAL_CONTEXT> {
  const { access, now } = centralPorts(service);
  const prompt = harnessPrompt(service, id, {
    tools: access.scoped(id),
    now: now(),
    role: access.caller(id).role,
  });
  return HARNESS_CENTRAL_CONTEXT.parse({
    ...prompt,
    tools: access.catalogue(id),
    declared_tool_names: access.declarationNames(id),
    compact_at_percent: service.store.assistantChat.settings().compact_at_percent,
  });
}
