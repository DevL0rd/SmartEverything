import { nativeProjectFile } from './project-files';
import type { z } from 'zod';
import { ApiError, HARNESS_CENTRAL_CONTEXT, HARNESS_CENTRAL_RESULT } from '@smarteverything/domain';
import type { HarnessTransportRequest } from '@smarteverything/domain';
import { bindNativeExecutionTarget, executionRole } from '../assistant/execution-authority';
import type { ConversationAuthority } from './authority-contract';
import type { HarnessService } from './service';
import type { HarnessHubTools } from './tools';
import { harnessPrompt } from './prompt';
import { admitCanonicalTool, type CentralToolRequest } from './canonical-tools';

interface CentralPorts {
  readonly access: HarnessHubTools;
  readonly now: () => Date;
}
const ports = new WeakMap<HarnessService, CentralPorts>();
export function bindCentralHarness(
  service: HarnessService,
  access: HarnessHubTools,
  now: () => Date,
): void {
  ports.set(service, { access, now });
  bindNativeExecutionTarget(service.store, (device, authority) =>
    nativeTarget(service, device, authority),
  );
}
function nativeTarget(
  service: HarnessService,
  device: string,
  authority: ConversationAuthority,
): boolean {
  const connection = service.directory.get({ kind: 'device', device_id: device });
  const host = connection.host;
  service.directory.bound(device, host.connection_generation, host.runtime_instance);
  return (
    connection.actor.kind === 'node' &&
    connection.actor.id === device &&
    executionRole(service.store, authority) === 'owner'
  );
}
function centralPorts(service: HarnessService): CentralPorts {
  const installed = ports.get(service);
  if (installed === undefined)
    throw new ApiError('conflict', 'Central native tool access is not installed.');
  return installed;
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
  if (request.operation === 'project_file')
    return nativeProjectFile(service, request, () => {
      service.storage.verify(request.claim, input);
    });
  if (request.operation !== 'context' && request.operation !== 'tool')
    throw new ApiError('invalid_request', 'Expected scoped central native access.');
  service.storage.verify(request.claim, input);
  const { access, now } = centralPorts(service);
  const id = request.claim.session_id;
  if (request.operation === 'context')
    return HARNESS_CENTRAL_CONTEXT.parse({
      text: harnessPrompt(service, id, {
        tools: access.scoped(id),
        now: now(),
        role: access.caller(id).role,
      }),
      tools: access.catalogue(id),
      compact_at_percent: service.store.assistantChat.settings().compact_at_percent,
    });
  admitCanonicalTool(service, request);
  const result = await centralCall(service, access, request);
  service.storage.verify(request.claim, input);
  return result;
}
async function centralCall(
  service: HarnessService,
  access: HarnessHubTools,
  request: CentralToolRequest,
): Promise<z.infer<typeof HARNESS_CENTRAL_RESULT>> {
  const { caller } = access.authorizeCall(
    request.claim.session_id,
    request.name,
    request.arguments,
  );
  const grant = service.storage.grant(request.claim.session_id);
  if (grant.event_id === null)
    throw new ApiError(
      'forbidden',
      'Central tool receipts require their canonical initiating event.',
    );
  const key = `central:${request.claim.session_id}:${String(request.call_seq)}:${request.call_id}`;
  const canonical = {
    session_id: request.claim.session_id,
    profile_id: caller.profileId,
    event_id: grant.event_id,
    call_seq: request.call_seq,
    call_id: request.call_id,
    name: request.name,
    arguments: request.arguments,
    role: caller.role,
    client_id: caller.clientId,
    via: caller.via,
    plugin_id: caller.pluginId ?? null,
    plugin_requester: caller.pluginRequester ?? null,
  };
  const receipt = service.store.harnessCoordination.begin(key, request.claim.session_id, canonical);
  if (receipt.state === 'completed' && receipt.result !== null)
    return HARNESS_CENTRAL_RESULT.parse(JSON.parse(receipt.result));
  if (receipt.result !== null || receipt.state === 'unknown')
    throw new ApiError('conflict', 'This central tool outcome is unknown and cannot be replayed.');
  service.store.harnessCoordination.finish(key, { state: 'admitted' }, 'unknown');
  const result = await access.transportCall(
    request.claim.session_id,
    request.name,
    request.arguments,
  );
  service.store.harnessCoordination.finish(key, result);
  return result;
}
