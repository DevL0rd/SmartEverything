import type { ReactNode } from 'react';
import {
  isCodexPermissionOnlyChange,
  CLAUDE_SETTABLE_MODES,
  type AiChatRow,
  type Engine,
  type CodexProviderOptions,
} from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';
import { useIsOwner } from '../../../store/selectors';
import { useChatProvider, useProviderControl } from '../provider/provider-data';
import { useProviderWorking } from '../provider/provider-working';
import { NATIVE_OWNER_REASON } from '../provider/provider-access';
import {
  claudePermissionLevel,
  codexPermissionLevel,
  CLAUDE_PERMISSION_LABELS,
  claudePermissionLabel,
  codexAccessLabel,
  codexApprovalLabel,
} from '../provider/permission-labels';
import type { ComputerEngine } from '../provider/computer-engine';
import { PermissionPill } from './permission-control';
interface Props {
  readonly engine: ComputerEngine;
  readonly onChange: (engine: Engine) => void;
  readonly chat?: AiChatRow;
}
export function NativePermissionControl(props: Props): ReactNode {
  return props.chat === undefined ? (
    <NativePermissions {...props} working={false} />
  ) : (
    <ChatNativePermissions {...props} chat={props.chat} />
  );
}
function ChatNativePermissions(props: Props & { readonly chat: AiChatRow }): ReactNode {
  const working = useProviderWorking(props.chat);
  return <NativePermissions {...props} working={working} />;
}
function NativePermissions(props: Props & { readonly working: boolean }): ReactNode {
  return props.engine.kind === 'claude' ? (
    <ClaudePermissions {...props} engine={props.engine} />
  ) : (
    <CodexPermissions {...props} engine={props.engine} />
  );
}
function ClaudePermissions({
  engine,
  chat,
  working,
  onChange,
}: Omit<Props, 'engine'> & {
  readonly engine: Extract<Engine, { kind: 'claude' }>;
  readonly working: boolean;
}): ReactNode {
  const owner = useIsOwner();
  const state = useChatProvider(chat?.id ?? 'draft', chat !== undefined && owner);
  const control = useProviderControl(chat?.id ?? 'draft');
  const live = supportsClaudePermissionChange(chat, state.data);
  const disabled = claudePermissionsDisabled(owner, control.isPending, working, live);
  const items = CLAUDE_SETTABLE_MODES.map((mode): MenuItem => ({
    label: CLAUDE_PERMISSION_LABELS[mode],
    icon: engine.settings.permission_mode === mode ? 'check' : 'shield',
    disabled,
    onPress: (): void => {
      if (disabled) return;
      if (live) control.mutate({ action: 'set_permission_mode', mode });
      else onChange({ ...engine, settings: { ...engine.settings, permission_mode: mode } });
    },
  }));
  if (!owner) items.push(statusItem(NATIVE_OWNER_REASON));
  if (working && !live) items.push(statusItem(claudePermissionReason(state.data)));
  return (
    <PermissionPill
      label={claudePermissionLabel(engine.settings)}
      items={items}
      unrestricted={engine.settings.permission_mode === 'bypassPermissions'}
      shortLabel={claudePermissionLevel(engine.settings)}
    />
  );
}
function CodexPermissions({
  engine,
  working,
  onChange,
}: Omit<Props, 'engine'> & {
  readonly engine: Extract<Engine, { kind: 'codex' }>;
  readonly working: boolean;
}): ReactNode {
  const owner = useIsOwner();
  const disabled = !owner;
  const change = (settings: CodexProviderOptions): void => {
    if (disabled || (working && !isCodexPermissionOnlyChange(engine, { ...engine, settings })))
      return;
    onChange({ ...engine, settings });
  };
  const items = [
    ...codexAccessItems(engine, disabled, working, change),
    ...codexApprovalItems(engine.settings, disabled, change),
  ];
  if (!owner) items.push(statusItem(NATIVE_OWNER_REASON));
  else items.push(statusItem('Changes apply to the next turn. Current actions keep their policy.'));
  return (
    <PermissionPill
      label={`${codexAccessLabel(engine.settings.sandbox_policy)} · ${codexApprovalLabel(engine.settings.approval_policy)}${working ? ' · Next turn' : ''}`}
      items={items}
      unrestricted={engine.settings.sandbox_policy?.type === 'dangerFullAccess'}
      shortLabel={codexPermissionLevel(engine.settings)}
      nextTurn={working}
    />
  );
}
function codexAccessItems(
  engine: Extract<Engine, { kind: 'codex' }>,
  disabled: boolean,
  working: boolean,
  change: (settings: CodexProviderOptions) => void,
): readonly MenuItem[] {
  const settings = engine.settings;
  const current = settings.sandbox_policy;
  const policies: readonly NonNullable<CodexProviderOptions['sandbox_policy']>[] = [
    current?.type === 'readOnly' ? current : { type: 'readOnly', networkAccess: false },
    current?.type === 'workspaceWrite'
      ? current
      : {
          type: 'workspaceWrite',
          writableRoots: [],
          networkAccess: false,
          excludeTmpdirEnvVar: true,
          excludeSlashTmp: true,
        },
    { type: 'dangerFullAccess' },
    current?.type === 'externalSandbox'
      ? current
      : { type: 'externalSandbox', networkAccess: 'restricted' },
  ];
  return [
    {
      label: 'Access · Runtime default',
      disabled,
      onPress: (): void => {
        const { sandbox_policy: _policy, ...rest } = settings;
        change(rest);
      },
    },
    ...policies.map((policy): MenuItem => ({
      label: `Access · ${codexAccessLabel(policy)}`,
      icon: current?.type === policy.type ? 'check' : 'shield',
      disabled:
        disabled ||
        (working &&
          !isCodexPermissionOnlyChange(engine, {
            ...engine,
            settings: { ...settings, sandbox_policy: policy },
          })),
      onPress: (): void => {
        change({ ...settings, sandbox_policy: policy });
      },
    })),
  ];
}
function codexApprovalItems(
  settings: CodexProviderOptions,
  disabled: boolean,
  change: (settings: CodexProviderOptions) => void,
): readonly MenuItem[] {
  const policies = ['untrusted', 'on-request', 'never'] as const;
  return [
    {
      label: 'Approvals · Runtime default',
      disabled,
      onPress: (): void => {
        const { approval_policy: _policy, ...rest } = settings;
        change(rest);
      },
    },
    ...policies.map((policy): MenuItem => ({
      label: `Approvals · ${codexApprovalLabel(policy)}`,
      icon: settings.approval_policy === policy ? 'check' : 'shield',
      disabled,
      onPress: (): void => {
        change({ ...settings, approval_policy: policy });
      },
    })),
  ];
}
function statusItem(label: string): MenuItem {
  return { label, disabled: true, onPress: (): void => undefined };
}

function supportsClaudePermissionChange(
  chat: AiChatRow | undefined,
  state: ReturnType<typeof useChatProvider>['data'],
): boolean {
  return (
    chat !== undefined &&
    state !== undefined &&
    state.job_id !== null &&
    state.metadata?.operations.includes('set_permission_mode') === true
  );
}
function claudePermissionReason(state: ReturnType<typeof useChatProvider>['data']): string {
  return (
    state?.metadata?.unavailable_operations['set_permission_mode'] ??
    'This runtime cannot change permissions during active work.'
  );
}

function claudePermissionsDisabled(
  owner: boolean,
  pending: boolean,
  working: boolean,
  live: boolean,
): boolean {
  return !owner || pending || (working && !live);
}
