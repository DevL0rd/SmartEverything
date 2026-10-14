import {
  harnessTargetKey,
  type AiHarnessHandoffRequest,
  type AiHarnessHost,
  type AiHarnessSession,
  type AiModelRoute,
} from '@smarteverything/domain';

export function harnessHandoffPolicyReason(
  session: AiHarnessSession,
  host: AiHarnessHost,
): string | null {
  const manifest = host.manifest;
  if (manifest === null) return 'Device capabilities are unavailable.';
  const recorded = session.permission;
  return manifest.permissions.some(
    (policy) => policy.sandbox === recorded.sandbox && policy.approval === recorded.approval,
  )
    ? null
    : `${host.name} does not support this chat’s permissions.`;
}

export function harnessDeviceIntent(
  session: AiHarnessSession,
  host: AiHarnessHost,
  route: AiModelRoute,
  recover = false,
): Omit<AiHarnessHandoffRequest, 'operation_id'> | null {
  if (session.epoch === null || harnessHandoffActive(session)) return null;
  if (!recover && session.handoff?.source_outcome === 'unknown') return null;
  if (harnessTargetKey(session.target) === harnessTargetKey(host.target)) return null;
  return {
    expected_epoch: session.epoch,
    target: host.target,
    mode: recover ? 'recover' : 'drain',
    route: { ...session.route, capability_revision: route.capability_revision },
  };
}

export function harnessHandoffActive(session: AiHarnessSession): boolean {
  return session.handoff !== null && !['completed', 'failed'].includes(session.handoff.stage);
}

export function harnessHandoffWaiting(session: AiHarnessSession): boolean {
  return (
    session.epoch === null ||
    session.handoff?.source_outcome === 'unknown' ||
    harnessHandoffActive(session)
  );
}
