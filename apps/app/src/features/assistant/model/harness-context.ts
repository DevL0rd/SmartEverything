import {
  harnessTargetKey,
  type AiHarnessTarget,
  type AiHarnessCatalogue,
  type AiHarnessHost,
  type DshEngine,
  type AiModelRoute,
} from '@smarteverything/domain';

export function harnessHostName(
  target: AiHarnessTarget,
  catalogue: AiHarnessCatalogue | undefined,
): string {
  if (target.kind === 'server') return 'Home hub';
  return (
    catalogue?.hosts.find((host) => harnessTargetKey(host.target) === harnessTargetKey(target))
      ?.name ?? 'Host unavailable'
  );
}
export function harnessHostReason(host: AiHarnessHost): string | null {
  if (!host.online) return host.unavailable_reason ?? 'This host is offline.';
  if (host.manifest === null)
    return host.unavailable_reason ?? 'The runtime has not reported its capabilities.';
  if (host.workspace?.available === false)
    return host.workspace.reason ?? 'The host workspace is unavailable.';
  return host.unavailable_reason;
}
export function harnessEngineReason(
  engine: DshEngine,
  catalogue: AiHarnessCatalogue | undefined,
): string | null {
  if (catalogue === undefined) return 'Loading SmartEverything hosts and model routes…';
  const host = catalogue.hosts.find(
    (row) => harnessTargetKey(row.target) === harnessTargetKey(engine.execution_target),
  );
  if (host === undefined) return 'The selected execution host is unavailable.';
  const reason = harnessHostReason(host);
  if (reason !== null) return reason;
  const route = catalogue.routes.find((row) => row.id === engine.model_route_id);
  if (route === undefined) return 'The selected model supplier is unavailable.';
  if (route.state === 'unavailable') return route.failure.message;
  return route.models.some((model) => model.id === engine.model)
    ? null
    : 'The selected model is not reported by this supplier.';
}
export function harnessRouteLabel(
  route: AiModelRoute,
  catalogue: AiHarnessCatalogue | undefined,
): string {
  const provider = {
    anthropic: 'Claude subscription',
    openai: 'ChatGPT plan',
    openrouter: 'OpenRouter · metered',
  } as const;
  return `${provider[route.auth.provider]} · ${harnessHostName(route.supplier, catalogue)}`;
}
