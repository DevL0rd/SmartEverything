import type {
  AiHarnessCatalogue,
  AiHarnessHost,
  AiHarnessPermission,
  DshEngine,
  Engine,
} from '@smarteverything/domain';
import { harnessHostReason } from './harness-context';

interface SelectionContext {
  readonly catalogue: AiHarnessCatalogue;
  readonly permission?: AiHarnessPermission | undefined;
}
export function ownDeviceEngine(
  engine: Engine,
  host: AiHarnessHost,
  context: SelectionContext,
): DshEngine | null {
  if (engine.kind !== 'dsh') return null;
  const permission = context.permission ?? engine.permission;
  if (!devicePermissionReady(host, permission)) return null;
  const route = context.catalogue.routes.find((row) => row.id === engine.model_route_id);
  return routeReady(route, engine.model, engine.effort)
    ? { ...engine, execution_target: host.target, permission }
    : null;
}

function routeReady(
  route: AiHarnessCatalogue['routes'][number] | undefined,
  modelId: string,
  effort: string | null,
): boolean {
  if (route?.state !== 'ready') return false;
  return route.models.some(
    (model) =>
      model.id === modelId && (effort === null || model.capabilities.efforts.includes(effort)),
  );
}

function devicePermissionReady(host: AiHarnessHost, permission: DshEngine['permission']): boolean {
  if (
    harnessHostReason(host) !== null ||
    host.manifest === null ||
    host.workspace?.available !== true
  )
    return false;
  return host.manifest.permissions.some(
    (policy) => policy.sandbox === permission.sandbox && policy.approval === permission.approval,
  );
}
