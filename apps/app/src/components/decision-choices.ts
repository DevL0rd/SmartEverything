import { z } from 'zod';
import type { CodexPrompt, JsonValue } from '@smarteverything/domain';
import type { DecisionOption } from './decision-options';
const POLICY = z.object({
  acceptWithExecpolicyAmendment: z.object({ execpolicy_amendment: z.array(z.string()) }),
});
const NETWORK = z.object({
  applyNetworkPolicyAmendment: z.object({
    network_policy_amendment: z.object({ host: z.string(), action: z.enum(['allow', 'deny']) }),
  }),
});
const PERMISSION = z.object({
  scope: z.enum(['turn', 'session']),
  permissions: z.record(z.string(), z.unknown()),
});
export interface ApprovalOption extends DecisionOption {
  readonly effect: 'allow' | 'deny' | 'cancel' | 'unknown';
}
function nativeChoice(value: JsonValue): Omit<ApprovalOption, 'id'> {
  if (value === 'accept') return { label: 'Allow once', effect: 'allow' };
  if (value === 'acceptForSession')
    return {
      label: 'Allow for this session',
      description: 'Applies to this native session.',
      effect: 'allow',
    };
  if (value === 'decline') return { label: 'Deny', effect: 'deny' };
  if (value === 'cancel') return { label: 'Cancel request', effect: 'cancel' };
  const policy = POLICY.safeParse(value);
  if (policy.success)
    return {
      label: 'Allow matching commands',
      description: `Arguments: ${policy.data.acceptWithExecpolicyAmendment.execpolicy_amendment.map((argument) => JSON.stringify(argument)).join(' · ')}`,
      effect: 'allow',
    };
  const network = NETWORK.safeParse(value);
  if (network.success) {
    const amendment = network.data.applyNetworkPolicyAmendment.network_policy_amendment;
    return {
      label: `${amendment.action === 'allow' ? 'Allow' : 'Block'} access to ${amendment.host}`,
      description: 'Changes the advertised network policy.',
      effect: 'allow',
    };
  }
  const permission = PERMISSION.safeParse(value);
  if (permission.success)
    return Object.keys(permission.data.permissions).length === 0
      ? { label: 'Deny', effect: 'deny' }
      : { label: `Allow for this ${permission.data.scope}`, effect: 'allow' };
  return {
    label: 'Unsupported approval choice',
    description: 'Answer this choice on the supplying computer.',
    disabled: true,
    effect: 'unknown',
  };
}
export function codexChoices(
  prompt: Extract<
    CodexPrompt,
    { kind: 'command_approval' | 'file_approval' | 'permissions_approval' }
  >,
): readonly ApprovalOption[] {
  return prompt.choices.map((choice) => ({ id: choice.id, ...nativeChoice(choice.value) }));
}
