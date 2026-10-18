import {
  harnessTargetKey,
  type AiHarnessHandoffRequest,
  type AiHarnessHost,
  type AiHarnessSession,
  type AiHarnessSwitchResult,
  type AiHarnessTarget,
  type AiModelRoute,
  type DshEngine,
} from '@smarteverything/domain';

export function harnessHandoffPolicyReason(
  session: AiHarnessSession,
  host: AiHarnessHost,
): string | null {
  const manifest = host.manifest;
  if (manifest === null) return 'This machine’s capabilities are unavailable.';
  const recorded = session.permission;
  return manifest.permissions.some(
    (policy) => policy.sandbox === recorded.sandbox && policy.approval === recorded.approval,
  )
    ? null
    : `${host.name} can’t run this chat’s permissions.`;
}

export type MachineSwitch =
  { readonly kind: 'idle' } | { readonly kind: 'pending'; readonly target: AiHarnessTarget };

export function machineSwitchOf(pending: AiHarnessTarget | null | undefined): MachineSwitch {
  return pending === null || pending === undefined
    ? { kind: 'idle' }
    : { kind: 'pending', target: pending };
}

export function machineSwitchRequest(input: {
  readonly engine: Pick<DshEngine, 'execution_target' | 'model' | 'effort'>;
  readonly route: Pick<AiModelRoute, 'id' | 'capability_revision'>;
  readonly session: Pick<AiHarnessSession, 'target' | 'directory'> | undefined;
  readonly operationId: string;
}): AiHarnessHandoffRequest {
  const { engine, route, session, operationId } = input;
  const directory =
    session !== undefined &&
    harnessTargetKey(session.target) === harnessTargetKey(engine.execution_target)
      ? session.directory
      : null;
  return {
    operation_id: operationId,
    target: engine.execution_target,
    route: {
      route_id: route.id,
      capability_revision: route.capability_revision,
      model: engine.model,
      effort: engine.effort,
    },
    ...(directory === null ? {} : { directory }),
  };
}

export function machineSwitchNotice(
  result: AiHarnessSwitchResult,
  machine: string,
): { readonly message: string } | null {
  return result.state === 'applied' ? { message: `Now on ${machine}` } : null;
}
