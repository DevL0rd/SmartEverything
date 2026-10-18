import type {
  AiHarnessPermission,
  ClaudeProviderOptions,
  CodexProviderOptions,
} from '@smarteverything/domain';
const CLAUDE_PERMISSION_LABELS = {
  default: 'Ask first',
  acceptEdits: 'Allow edits',
  plan: 'Plan only',
  auto: 'Automatic approvals',
  bypassPermissions: 'Full access',
  dontAsk: 'Decline unapproved actions',
} as const;
export function harnessPermissionLabel(permission: AiHarnessPermission): string {
  const sandbox = {
    'danger-full-access': 'Full access',
    'workspace-write': 'Allow edits',
    'read-only': 'Read only',
  } as const;
  const approval = {
    never: 'Never ask',
    'on-request': 'Ask when needed',
  } as const;
  return `${sandbox[permission.sandbox]} · ${approval[permission.approval]}`;
}
export function claudePermissionLabel(settings: ClaudeProviderOptions): string {
  return settings.permission_mode === undefined
    ? 'Default'
    : CLAUDE_PERMISSION_LABELS[settings.permission_mode];
}
export function codexAccessLabel(policy: CodexProviderOptions['sandbox_policy']): string {
  if (policy === undefined) return 'Default';
  const labels = {
    readOnly: 'Read only',
    workspaceWrite: 'Allow edits',
    dangerFullAccess: 'Full access',
    externalSandbox: 'External sandbox',
  } as const;
  return labels[policy.type];
}
export function codexApprovalLabel(policy: CodexProviderOptions['approval_policy']): string {
  if (policy === undefined) return 'Default';
  if (typeof policy !== 'string') return 'Custom approvals';
  const labels = {
    untrusted: 'Ask first',
    'on-request': 'Ask when needed',
    never: 'Never ask',
  } as const;
  return labels[policy];
}
