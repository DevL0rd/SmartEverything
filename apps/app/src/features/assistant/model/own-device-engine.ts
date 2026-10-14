import {
  AI_EFFORT,
  closestEffort,
  DEFAULT_AI_HARNESS_PERMISSION,
  type AiHarnessCatalogue,
  type AiHarnessHost,
  type AiHarnessPermission,
  type AiModelSuggested,
  type AiModelRow,
  type DshEngine,
  type Engine,
  type OpenRouterStatus,
} from '@smarteverything/domain';
import { harnessHostReason } from './harness-context';

interface SelectionContext {
  readonly catalogue: AiHarnessCatalogue;
  readonly suggested: AiModelSuggested | undefined;
  readonly status: OpenRouterStatus | undefined;
  readonly permission?: AiHarnessPermission | undefined;
}
export function ownDeviceEngine(
  engine: Engine,
  host: AiHarnessHost,
  context: SelectionContext,
): DshEngine | null {
  if (engine.kind !== 'dsh' && engine.kind !== 'openrouter') return null;
  const permission =
    context.permission ??
    (engine.kind === 'dsh' ? engine.permission : DEFAULT_AI_HARNESS_PERMISSION);
  if (!devicePermissionReady(host, permission)) return null;
  if (engine.kind === 'openrouter') return legacyDeviceEngine(engine, host, context, permission);
  const route = context.catalogue.routes.find((row) => row.id === engine.model_route_id);
  return routeReady(route, engine.model, engine.effort)
    ? { ...engine, execution_target: host.target, permission }
    : null;
}
function legacyDeviceEngine(
  engine: Extract<Engine, { kind: 'openrouter' }>,
  host: AiHarnessHost,
  context: SelectionContext,
  permission: AiHarnessPermission,
): DshEngine | null {
  const { suggested, status, catalogue } = context;
  if (suggested === undefined || status === undefined) return null;
  const model = engine.model === null ? suggested.default_model : suggested.current;
  if (!legacyModelReady(model)) return null;
  const wanted = AI_EFFORT.safeParse(engine.effort ?? status.settings.default_effort);
  if (!wanted.success) return null;
  const effort = model.reasoning === 'none' ? null : closestEffort(model, wanted.data);
  const routes = catalogue.routes.filter(
    (route) => route.auth.provider === 'openrouter' && routeReady(route, model.id, effort),
  );
  const route = routes.length === 1 ? routes[0] : undefined;
  if (route === undefined) return null;
  return {
    kind: 'dsh',
    execution_target: host.target,
    session_id: null,
    model_route_id: route.id,
    model: model.id,
    effort,
    permission,
  };
}
function legacyModelReady(model: AiModelRow | null): model is AiModelRow {
  return model?.provider === 'openrouter' && !/^(?:anthropic|openai)\//.test(model.id);
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
