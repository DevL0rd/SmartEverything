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
      ?.name ?? 'Machine unavailable'
  );
}
export function harnessHostReason(host: AiHarnessHost): string | null {
  if (!host.online) return host.unavailable_reason ?? 'This machine is offline.';
  if (host.manifest === null)
    return (
      host.unavailable_reason ??
      'SmartEverything on this machine hasn’t reported what it can do yet.'
    );
  if (host.workspace?.available === false)
    return host.workspace.reason ?? 'This machine’s workspace is unavailable.';
  return host.unavailable_reason;
}
export function harnessEngineReason(
  engine: DshEngine,
  catalogue: AiHarnessCatalogue | undefined,
): string | null {
  if (catalogue === undefined) return 'Loading machines and models…';
  const host = catalogue.hosts.find(
    (row) => harnessTargetKey(row.target) === harnessTargetKey(engine.execution_target),
  );
  if (host === undefined) return 'The selected machine is unavailable. Switch machine.';
  const reason = harnessHostReason(host);
  if (reason !== null) return reason;
  const route = catalogue.routes.find((row) => row.id === engine.model_route_id);
  if (route === undefined) return 'The selected plan is unavailable.';
  if (route.state === 'unavailable') return route.failure.message;
  return route.models.some((model) => model.id === engine.model)
    ? null
    : 'This plan doesn’t offer the selected model.';
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
