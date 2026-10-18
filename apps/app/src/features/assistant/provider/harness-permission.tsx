import type { AiHarnessPermission } from '@smarteverything/domain';

export function permissionLabel(policy: AiHarnessPermission): string {
  const sandbox = {
    'danger-full-access': 'Full access',
    'workspace-write': 'Workspace write',
    'read-only': 'Read only',
  } as const;
  const approval = {
    never: 'no routine approvals',
    'on-request': 'approve on request',
  } as const;
  return `${sandbox[policy.sandbox]} · ${approval[policy.approval]}`;
}
