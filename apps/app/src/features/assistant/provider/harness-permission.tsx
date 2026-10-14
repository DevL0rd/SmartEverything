import { useState, type ReactNode } from 'react';
import type { AiHarnessPermission, AiHarnessHost } from '@smarteverything/domain';
import { DEFAULT_AI_HARNESS_PERMISSION } from '@smarteverything/domain';
import { Select } from '../../../components/select';

export function permissionKey(value: AiHarnessPermission): string {
  return `${value.sandbox}:${value.approval}`;
}
export function useHarnessPermission(
  host: AiHarnessHost | undefined,
  initial: AiHarnessPermission = DEFAULT_AI_HARNESS_PERMISSION,
): {
  readonly key: string;
  readonly permission: AiHarnessPermission | null;
  readonly policies: readonly AiHarnessPermission[];
  readonly change: (key: string) => void;
} {
  const [key, change] = useState(permissionKey(initial));
  const policies = host?.manifest?.permissions ?? [];
  return {
    key,
    change,
    policies,
    permission: policies.find((policy) => permissionKey(policy) === key) ?? null,
  };
}
export function HarnessPermissionField({
  control,
}: {
  readonly control: ReturnType<typeof useHarnessPermission>;
}): ReactNode {
  return (
    <Select
      label="Permissions"
      value={control.key}
      options={control.policies.map((policy) => ({
        value: permissionKey(policy),
        label: permissionLabel(policy),
      }))}
      onChange={control.change}
      placeholder="Choose a policy supported by this host"
    />
  );
}

export function permissionLabel(policy: AiHarnessPermission): string {
  const sandbox = {
    'danger-full-access': 'Full access',
    'workspace-write': 'Workspace write',
    'read-only': 'Read only',
  } as const;
  const approval = {
    never: 'no routine approvals',
    'on-request': 'approve on request',
    'on-failure': 'approve on failure',
    untrusted: 'approve untrusted actions',
  } as const;
  return `${sandbox[policy.sandbox]} · ${approval[policy.approval]}`;
}
