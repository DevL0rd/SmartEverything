import type {
  AiHarnessPermission,
  ClaudeProviderOptions,
  CodexProviderOptions,
} from '@smarteverything/domain';
export const CLAUDE_PERMISSION_LABELS = {
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
    never: 'No prompts',
    'on-request': 'Ask when needed',
    'on-failure': 'Ask after failure',
    untrusted: 'Ask first',
  } as const;
  return `${sandbox[permission.sandbox]} · ${approval[permission.approval]}`;
}
export function claudePermissionLabel(settings: ClaudeProviderOptions): string {
  return settings.permission_mode === undefined
    ? 'Runtime default'
    : CLAUDE_PERMISSION_LABELS[settings.permission_mode];
}
export function codexAccessLabel(policy: CodexProviderOptions['sandbox_policy']): string {
  if (policy === undefined) return 'Runtime default';
  const labels = {
    readOnly: 'Read only',
    workspaceWrite: 'Allow edits',
    dangerFullAccess: 'Full access',
    externalSandbox: 'External sandbox',
  } as const;
  return labels[policy.type];
}
export function codexApprovalLabel(policy: CodexProviderOptions['approval_policy']): string {
  if (policy === undefined) return 'Runtime default';
  if (typeof policy !== 'string') return 'Custom approvals';
  const labels = {
    untrusted: 'Ask first',
    'on-request': 'Ask when needed',
    never: 'No prompts',
  } as const;
  return labels[policy];
}

export function harnessPermissionLevel(permission: AiHarnessPermission): string {
  const levels = {
    'danger-full-access': 'Full',
    'workspace-write': 'Edits',
    'read-only': 'Read only',
  } as const;
  return levels[permission.sandbox];
}
export function claudePermissionLevel(settings: ClaudeProviderOptions): string {
  if (settings.permission_mode === undefined) return 'Default';
  const levels = {
    default: 'Ask',
    acceptEdits: 'Edits',
    plan: 'Plan',
    auto: 'Auto',
    bypassPermissions: 'Full',
    dontAsk: 'Deny',
  } as const;
  return levels[settings.permission_mode];
}
export function codexPermissionLevel(settings: CodexProviderOptions): string {
  const policy = settings.sandbox_policy;
  if (policy !== undefined)
    return {
      readOnly: 'Read only',
      workspaceWrite: 'Edits',
      dangerFullAccess: 'Full',
      externalSandbox: 'Sandbox',
    }[policy.type];
  if (settings.approval_policy === undefined) return 'Default';
  if (typeof settings.approval_policy !== 'string') return 'Custom';
  return { untrusted: 'Ask', 'on-request': 'Ask', never: 'No prompts' }[settings.approval_policy];
}
