import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type {
  AiModelRoute,
  DshWriterClaim,
  SubscriptionInferenceRequest,
} from '@smarteverything/domain';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { HarnessService } from './service';
import type { LocalHarnessPersistence } from './local-persistence';
import type { HarnessConnection } from './directory';
import type { HarnessGrant } from './grant';

export function admitSupplierInference(
  service: HarnessService,
  binding: {
    readonly device_id: string;
    readonly generation: string;
    readonly runtime_instance: string;
  },
  request: SubscriptionInferenceRequest,
): void {
  const supplier = service.directory.bound(
    binding.device_id,
    binding.generation,
    binding.runtime_instance,
  );
  const expected = request.route;
  admitSupplierBinding(supplier, expected, binding.device_id);
  const current = service.routes
    .list(expected.profile_id)
    .find((route) => route.id === expected.id);
  if (current?.state !== 'ready' || JSON.stringify(current) !== JSON.stringify(expected))
    throw new ApiError('conflict', 'Supplier model account or capability publication changed.');
  if (request.kind === 'resolve') {
    if (!current.models.some((model) => model.id === request.model))
      throw new ApiError('forbidden', 'Supplier model was not discovered on the selected route.');
    return;
  }
  admitConsumerBinding(service, request);
  admitExecutionWriter(service, request.claim, current, request.options);
}
export function authorizeHubSupplier(
  service: HarnessService,
  persistence: LocalHarnessPersistence,
  route: AiModelRoute,
  options: GenerateOptions,
): Promise<DshWriterClaim> {
  if (options.sessionId === undefined)
    throw new ApiError('forbidden', 'Supplier inference needs its owned hub conversation.');
  const claim = persistence.claim(options.sessionId);
  if (claim.target.kind !== 'server')
    throw new ApiError(
      'forbidden',
      'Hub subscription inference requires its canonical server writer.',
    );
  admitExecutionWriter(service, claim, route, {
    provider: options.provider,
    model: options.model,
    sessionId: options.sessionId,
  });
  return Promise.resolve(claim);
}
function admitExecutionWriter(
  service: HarnessService,
  claim: DshWriterClaim,
  route: AiModelRoute,
  options: { readonly provider: string; readonly model: string; readonly sessionId: string },
): void {
  const { provider, model, sessionId } = options;
  const grant = service.storage.grant(sessionId);
  const connection = service.directory.get(grant.target);
  const execution = connection.host;
  admitExecutionConnection(service, connection, grant);
  const selected = service.routes.selected(
    grant.profile_id,
    grant.route,
    grant.authority.kind === 'trigger',
  );
  if (
    harnessTargetKey(claim.target) !== harnessTargetKey(grant.target) ||
    claim.session_id !== sessionId ||
    grant.profile_id !== route.profile_id ||
    provider !== route.id ||
    model !== grant.route.model ||
    grant.route.credential_generation !== route.credential_generation ||
    grant.runtime_instance !== execution.runtime_instance ||
    grant.generation !== execution.connection_generation
  )
    throw new ApiError(
      'forbidden',
      'Supplier call differs from the exact executing writer, profile, session, route or account generation.',
    );
  admitSelectedAccount(selected, route);
  service.store.dshSessions.verifyWriter(claim, service.hostPrincipal(grant.profile_id, execution));
}
export function subscriptionInferenceConnection(
  service: HarnessService,
  route: AiModelRoute,
): HarnessConnection {
  const connection = service.directory.get(route.supplier);
  if (
    connection.inference === undefined ||
    connection.host.manifest?.subscription_inference?.protocol !== 1
  )
    throw new ApiError(
      'conflict',
      'This supplier does not support remote subscription inference. Update or reconnect its runtime; no fallback is available.',
    );
  return connection;
}

function admitSupplierBinding(
  supplier: HarnessConnection,
  route: AiModelRoute,
  deviceId: string,
): void {
  if (
    supplier.actor.kind !== 'node' ||
    supplier.host.manifest?.subscription_inference?.protocol !== 1 ||
    supplier.host.target.kind !== 'device'
  )
    throw new ApiError(
      'forbidden',
      'This connection did not negotiate supplying-account inference.',
    );
  if (
    route.supplier.kind !== 'device' ||
    route.supplier.device_id !== deviceId ||
    route.billing !== 'subscription-only' ||
    route.auth.provider === 'openrouter'
  )
    throw new ApiError('forbidden', 'This connection is not the exact subscription supplier.');
}
function admitSelectedAccount(selected: AiModelRoute, route: AiModelRoute): void {
  if (
    selected.id !== route.id ||
    selected.capability_revision !== route.capability_revision ||
    selected.credential_generation !== route.credential_generation
  )
    throw new ApiError(
      'forbidden',
      'This selected route account or capability generation changed.',
    );
}

export function admitConsumerExecution(
  service: HarnessService,
  connection: HarnessConnection,
): void {
  const host = connection.host;
  if (host.manifest?.subscription_consumer?.protocol !== 1 || host.target.kind !== 'device')
    throw new ApiError('forbidden', 'This execution host did not negotiate model consumption.');
  admitComputerConsumer(service, connection, host.target.device_id);
}

function admitComputerConsumer(
  service: HarnessService,
  connection: HarnessConnection,
  deviceId: string,
): void {
  const host = connection.host;
  if (
    connection.actor.kind !== 'node' ||
    connection.actor.id !== deviceId ||
    (host.platform !== 'linux' && host.platform !== 'macos') ||
    !host.inbound_execution ||
    connection.execute === undefined ||
    service.store.devices.byId(deviceId).kind !== 'computer'
  )
    throw new ApiError(
      'forbidden',
      'Model consumption requires its authenticated supported computer execution channel.',
    );
}

function admitConsumerBinding(
  service: HarnessService,
  request: Extract<SubscriptionInferenceRequest, { kind: 'stream' }>,
): void {
  if (request.claim.target.kind === 'server') return;
  const binding = request.execution;
  if (
    request.claim.target.device_id !== binding?.device_id ||
    request.claim.runtime_instance !== binding.runtime_instance ||
    request.claim.connection_generation !== binding.generation
  )
    throw new ApiError(
      'forbidden',
      'This device model call lacks its exact consumer execution binding.',
    );
  const connection = service.directory.bound(
    binding.device_id,
    binding.generation,
    binding.runtime_instance,
  );
  admitConsumerExecution(service, connection);
  if (binding.platform !== connection.host.platform)
    throw new ApiError('forbidden', 'The model call names another execution platform.');
}

function admitExecutionConnection(
  service: HarnessService,
  connection: HarnessConnection,
  grant: HarnessGrant,
): void {
  if (grant.target.kind !== 'device') return;
  admitConsumerExecution(service, connection);
}
