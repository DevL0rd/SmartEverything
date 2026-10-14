import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { CODEX_PROVIDER_OPTIONS, type CodexProviderOptions } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextField } from '../../../components/text-field';
import { Text } from '../../../components/text';
import { jsonText } from '../../../format/json-text';
interface ValueProps {
  readonly value: CodexProviderOptions;
  readonly change: (value: CodexProviderOptions) => void;
  readonly permissionControls?: boolean;
}
function without(value: CodexProviderOptions, key: string): CodexProviderOptions {
  return CODEX_PROVIDER_OPTIONS.parse(
    Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)),
  );
}
function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
function sandboxType(value: CodexProviderOptions, type: string): CodexProviderOptions {
  if (type === 'default') return without(value, 'sandbox_policy');
  const policies: Readonly<Record<string, unknown>> = {
    readOnly: { type: 'readOnly', networkAccess: false },
    workspaceWrite: {
      type: 'workspaceWrite',
      writableRoots: [],
      networkAccess: false,
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    },
    externalSandbox: { type: 'externalSandbox', networkAccess: 'restricted' },
    dangerFullAccess: { type: 'dangerFullAccess' },
  };
  return CODEX_PROVIDER_OPTIONS.parse({ ...value, sandbox_policy: policies[type] });
}
function WorkspaceFlags({ value, change }: ValueProps): ReactNode {
  const policy = value.sandbox_policy;
  if (policy?.type !== 'workspaceWrite') return null;
  return (
    <>
      <SwitchRow
        title="Exclude temporary environment directory"
        value={policy.excludeTmpdirEnvVar}
        onChange={(excludeTmpdirEnvVar) => {
          change({ ...value, sandbox_policy: { ...policy, excludeTmpdirEnvVar } });
        }}
      />
      <SwitchRow
        title="Exclude /tmp"
        value={policy.excludeSlashTmp}
        onChange={(excludeSlashTmp) => {
          change({ ...value, sandbox_policy: { ...policy, excludeSlashTmp } });
        }}
      />
      <TextField
        label="Writable roots"
        helper="One absolute path per line; validated on the target computer"
        multiline
        value={policy.writableRoots.join('\n')}
        onChange={(text) => {
          change({ ...value, sandbox_policy: { ...policy, writableRoots: lines(text) } });
        }}
      />
    </>
  );
}
function Sandbox({ value, change, permissionControls = true }: ValueProps): ReactNode {
  const policy = value.sandbox_policy;
  return (
    <List title="Native sandbox">
      {permissionControls ? (
        <SelectRow
          title="Sandbox policy"
          value={policy?.type ?? 'default'}
          options={[
            { value: 'default', label: 'Runtime default' },
            { value: 'readOnly', label: 'Read only' },
            { value: 'workspaceWrite', label: 'Workspace write' },
            { value: 'dangerFullAccess', label: 'Full access' },
            { value: 'externalSandbox', label: 'External sandbox' },
          ]}
          onChange={(type) => {
            change(sandboxType(value, type));
          }}
        />
      ) : null}
      {policy === undefined || policy.type === 'dangerFullAccess' ? null : (
        <SwitchRow
          title="Network access"
          value={policy.networkAccess === true || policy.networkAccess === 'enabled'}
          onChange={(enabled) => {
            change({
              ...value,
              sandbox_policy:
                policy.type === 'externalSandbox'
                  ? { ...policy, networkAccess: enabled ? 'enabled' : 'restricted' }
                  : { ...policy, networkAccess: enabled },
            });
          }}
        />
      )}
      <WorkspaceFlags value={value} change={change} />
    </List>
  );
}
const GRANULAR = {
  sandbox_approval: true,
  rules: true,
  skill_approval: true,
  request_permissions: true,
  mcp_elicitations: true,
};
function Approvals({ value, change, permissionControls = true }: ValueProps): ReactNode {
  const policy = value.approval_policy;
  return (
    <List title="Approvals">
      {permissionControls ? (
        <SelectRow
          title="Approval policy"
          value={
            typeof policy === 'string' ? policy : policy === undefined ? 'default' : 'granular'
          }
          options={[
            { value: 'default', label: 'Runtime default' },
            { value: 'untrusted', label: 'Untrusted commands' },
            { value: 'on-request', label: 'On request' },
            { value: 'never', label: 'Never' },
            { value: 'granular', label: 'Granular approvals' },
          ]}
          onChange={(chosen) => {
            change(
              CODEX_PROVIDER_OPTIONS.parse(
                chosen === 'default'
                  ? without(value, 'approval_policy')
                  : {
                      ...value,
                      approval_policy: chosen === 'granular' ? { granular: GRANULAR } : chosen,
                    },
              ),
            );
          }}
        />
      ) : null}
      {typeof policy !== 'object' ? null : (
        <GranularApprovals policy={policy} value={value} change={change} />
      )}
    </List>
  );
}
function OutputSchema({
  value,
  change,
  invalid,
}: ValueProps & { readonly invalid: (error: string | null) => void }): ReactNode {
  const [draft, setDraft] = useState(
    value.output_schema === undefined ? '' : JSON.stringify(value.output_schema, null, 2),
  );
  return (
    <TextField
      label="Output JSON schema"
      multiline
      value={draft}
      onChange={(text) => {
        setDraft(text);
        const json = jsonText(text === '' ? 'null' : text);
        if (!json.ok) {
          invalid(json.reason);
          return;
        }
        const parsed = CODEX_PROVIDER_OPTIONS.safeParse(
          text === '' ? without(value, 'output_schema') : { ...value, output_schema: json.value },
        );
        invalid(parsed.success ? null : parsed.error.message);
        if (parsed.success) change(parsed.data);
      }}
    />
  );
}
function Advanced({
  value,
  change,
  invalid,
}: ValueProps & { readonly invalid: (error: string | null) => void }): ReactNode {
  return (
    <View className="gap-4">
      <TextField
        label="Additional directories"
        helper="One absolute path on the supplying computer per line"
        multiline
        value={value.additional_directories?.join('\n') ?? ''}
        onChange={(text) => {
          change(
            text.trim() === ''
              ? without(value, 'additional_directories')
              : { ...value, additional_directories: lines(text) },
          );
        }}
      />
      <TextField
        label="Service tier"
        helper="Only tiers reported by this model and account are accepted by the computer"
        value={value.service_tier ?? ''}
        onChange={(text) => {
          change(text === '' ? without(value, 'service_tier') : { ...value, service_tier: text });
        }}
      />
      <OutputSchema value={value} change={change} invalid={invalid} />
    </View>
  );
}
export function CodexOptions({
  options,
  pending,
  disabled = false,
  permissionControls = true,
  save,
}: {
  readonly options: CodexProviderOptions;
  readonly pending: boolean;
  readonly disabled?: boolean;
  readonly permissionControls?: boolean;
  readonly save: (options: CodexProviderOptions) => void;
}): ReactNode {
  const [value, change] = useState(options);
  const [error, invalid] = useState<string | null>(null);
  return (
    <View className="gap-section-gap">
      <TextField
        label="Working directory"
        value={value.cwd ?? ''}
        disabled={disabled}
        helper="Absolute path on the supplying computer; leave empty for its managed workspace"
        onChange={(cwd) => {
          change(cwd === '' ? without(value, 'cwd') : { ...value, cwd });
        }}
      />
      <Approvals value={value} change={change} permissionControls={permissionControls} />
      <Sandbox value={value} change={change} permissionControls={permissionControls} />
      <Advanced value={value} change={change} invalid={invalid} />
      {error === null ? null : <Text tone="critical">{error}</Text>}
      <Button
        label="Save Codex options"
        disabled={disabled || error !== null}
        loading={pending}
        onPress={() => {
          const parsed = CODEX_PROVIDER_OPTIONS.safeParse(value);
          if (parsed.success) save(parsed.data);
          else invalid(parsed.error.message);
        }}
      />
      {disabled ? (
        <Text tone="variant">Stop active work before changing the execution binding.</Text>
      ) : null}
    </View>
  );
}

function GranularApprovals({
  policy,
  value,
  change,
}: ValueProps & {
  readonly policy: Exclude<NonNullable<CodexProviderOptions['approval_policy']>, string>;
}): ReactNode {
  return (
    <>
      {Object.entries(policy.granular).map(([key, enabled]) => (
        <SwitchRow
          key={key}
          title={key.replaceAll('_', ' ')}
          value={enabled}
          onChange={(next): void => {
            change(
              CODEX_PROVIDER_OPTIONS.parse({
                ...value,
                approval_policy: { granular: { ...policy.granular, [key]: next } },
              }),
            );
          }}
        />
      ))}
    </>
  );
}
