import type {
  AiHarnessPermission,
  AiPermissionPresets,
  ClaudeProviderOptions,
  CodexProviderOptions,
} from '@smarteverything/domain';
import { accessPill } from '../access/ai-access';
import { presetName } from '../access/harness-access';
const CLAUDE_PERMISSION_LABELS = {
  default: 'Ask first',
  acceptEdits: 'Allow edits',
  plan: 'Plan only',
  auto: 'Automatic approvals',
  bypassPermissions: 'Full access',
  dontAsk: 'Decline unapproved actions',
} as const;
export function harnessPermissionLabel(
  permission: AiHarnessPermission,
  presets: AiPermissionPresets | null,
): string {
  const approval = {
    never: 'Never ask',
    'on-request': 'Ask when needed',
  } as const;
  const access = accessPill({
    kind: 'harness',
    permission,
    title: presetName(presets, permission.sandbox),
  }).title;
  return `${access} · ${approval[permission.approval]}`;
}
export function claudePermissionLabel(settings: ClaudeProviderOptions): string {
  return settings.permission_mode === undefined
    ? 'As the runtime is set up'
    : CLAUDE_PERMISSION_LABELS[settings.permission_mode];
}
export function codexAccessLabel(policy: CodexProviderOptions['sandbox_policy']): string {
  if (policy === undefined) return 'As the runtime is set up';
  const labels = {
    readOnly: 'Read only',
    workspaceWrite: 'Allow edits',
    dangerFullAccess: 'Full access',
    externalSandbox: 'External sandbox',
  } as const;
  return labels[policy.type];
}
export function codexApprovalLabel(policy: CodexProviderOptions['approval_policy']): string {
  if (policy === undefined) return 'As the runtime is set up';
  if (typeof policy !== 'string') return 'Custom approvals';
  const labels = {
    untrusted: 'Ask first',
    'on-request': 'Ask when needed',
    never: 'Never ask',
  } as const;
  return labels[policy];
}
