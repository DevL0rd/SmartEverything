import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  CLAUDE_PROVIDER_OPTIONS,
  CLAUDE_SETTABLE_MODES,
  type ClaudeProviderOptions,
  type ProviderMetadata,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SwitchRow, SelectRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextField } from '../../../components/text-field';
import { Text } from '../../../components/text';
import { AgentSettings } from './agent-settings';
import { ProviderFlagOptions } from './provider-flag-options';
import { ProviderSessionOptions } from './provider-session-options';
import { ProviderNumbers } from './provider-numbers';
import { ProviderLists } from './provider-lists';
import { McpServers } from './mcp-servers';
import { jsonText } from '../../../format/json-text';

interface OptionsProps {
  readonly options: ClaudeProviderOptions;
  readonly metadata?: ProviderMetadata;
  readonly pending: boolean;
  readonly permissionControls?: boolean;
  readonly save: (options: ClaudeProviderOptions) => void;
}

const TEXT_FIELDS = [
  { key: 'cwd', label: 'Working directory', help: 'Absolute path on the supplying computer' },
  { key: 'title', label: 'Session title', help: 'Optional native provider session title' },
] as const;
const JSON_FIELDS = [
  {
    key: 'output_format',
    label: 'Output format',
    help: 'Optional {"type":"json_schema","schema":{…}}',
  },
] as const;

function SourceRows({
  value,
  change,
}: {
  readonly value: ClaudeProviderOptions;
  readonly change: (value: ClaudeProviderOptions) => void;
}): ReactNode {
  return (
    <List title="Settings sources" footer="Only selected local configuration sources are loaded.">
      {(['user', 'project', 'local'] as const).map((source) => (
        <SwitchRow
          key={source}
          title={source}
          value={value.setting_sources?.includes(source) === true}
          onChange={(enabled) => {
            const sources = value.setting_sources ?? [];
            change({
              ...value,
              setting_sources: enabled
                ? [...sources, source]
                : sources.filter((item) => item !== source),
            });
          }}
        />
      ))}
    </List>
  );
}

function ThinkingRows({
  value,
  change,
}: {
  readonly value: ClaudeProviderOptions;
  readonly change: (value: ClaudeProviderOptions) => void;
}): ReactNode {
  return (
    <List
      title="Thinking and execution"
      footer="The selected runtime validates model support and account availability before applying these options."
    >
      <SelectRow
        title="Thinking"
        value={value.thinking ?? null}
        options={(['adaptive', 'enabled', 'disabled'] as const).map((item) => ({
          value: item,
          label: item,
        }))}
        onChange={(thinking) => {
          change({ ...value, thinking });
        }}
      />
      <SelectRow
        title="Thinking display"
        value={value.thinking_display ?? null}
        options={(['summarized', 'omitted'] as const).map((item) => ({ value: item, label: item }))}
        onChange={(thinking_display) => {
          change({ ...value, thinking_display });
        }}
      />
      <SwitchRow
        title="Fast mode"
        subtitle="Extra plan usage; availability varies by model and plan"
        value={value.fast === true}
        onChange={(fast) => {
          change({ ...value, fast });
        }}
      />
      <SwitchRow
        title="Fork session"
        subtitle="Branch the provider session when starting a new turn"
        value={value.fork_session === true}
        onChange={(fork_session) => {
          change({ ...value, fork_session });
        }}
      />
    </List>
  );
}

function StructuredFields({
  value,
  change,
  invalid,
}: {
  readonly value: ClaudeProviderOptions;
  readonly change: (value: ClaudeProviderOptions) => void;
  readonly invalid: (key: string, reason: string | null) => void;
}): ReactNode {
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  return (
    <View className="gap-4">
      {JSON_FIELDS.map((field) => (
        <TextField
          key={field.key}
          label={field.label}
          helper={field.help}
          multiline
          value={
            drafts[field.key] ??
            (value[field.key] === undefined ? '' : JSON.stringify(value[field.key], null, 2))
          }
          onChange={(text) => {
            setDrafts({ ...drafts, [field.key]: text });
            const parsed = jsonText(text === '' ? 'null' : text);
            if (!parsed.ok) {
              invalid(field.key, parsed.reason);
              return;
            }
            const candidate =
              text === ''
                ? withoutOption(value, field.key)
                : { ...value, [field.key]: parsed.value };
            const checked = CLAUDE_PROVIDER_OPTIONS.safeParse(candidate);
            invalid(
              field.key,
              checked.success
                ? null
                : checked.error.issues.map((issue) => issue.message).join('; '),
            );
            if (checked.success) change(checked.data);
          }}
        />
      ))}
    </View>
  );
}

function withoutOption(value: ClaudeProviderOptions, key: string): ClaudeProviderOptions {
  return CLAUDE_PROVIDER_OPTIONS.parse(
    Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)),
  );
}

function TextFields({
  value,
  change,
}: {
  readonly value: ClaudeProviderOptions;
  readonly change: (value: ClaudeProviderOptions) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      {TEXT_FIELDS.map((field) => (
        <TextField
          key={field.key}
          label={field.label}
          helper={field.help}
          value={value[field.key] ?? ''}
          onChange={(text) => {
            change(text === '' ? withoutOption(value, field.key) : { ...value, [field.key]: text });
          }}
        />
      ))}
    </View>
  );
}

function PermissionRows({
  value,
  change,
}: {
  readonly value: ClaudeProviderOptions;
  readonly change: (value: ClaudeProviderOptions) => void;
}): ReactNode {
  return (
    <List title="Permissions">
      <SelectRow
        title="Permission mode"
        value={value.permission_mode ?? null}
        options={CLAUDE_SETTABLE_MODES.map((mode) => ({ value: mode, label: mode }))}
        onChange={(permission_mode) => {
          change({ ...value, permission_mode });
        }}
      />
    </List>
  );
}
function NativeExtensions({
  value,
  change,
}: {
  readonly value: ClaudeProviderOptions;
  readonly change: (value: ClaudeProviderOptions) => void;
}): ReactNode {
  return (
    <>
      {' '}
      <McpServers
        servers={value.mcp_servers ?? {}}
        change={(mcp_servers) => {
          change({ ...value, mcp_servers });
        }}
      />
      <AgentSettings
        agents={value.agents ?? {}}
        change={(agents) => {
          change({ ...value, agents });
        }}
      />
    </>
  );
}
export function ProviderOptions({
  options,
  pending,
  save,
  metadata,
  permissionControls = true,
}: OptionsProps): ReactNode {
  const [value, change] = useState(options);
  const [errors, setErrors] = useState<Readonly<Record<string, string | null>>>({});
  const invalid = (key: string, reason: string | null): void => {
    setErrors({ ...errors, [key]: reason });
  };
  const problems = Object.values(errors).filter((error) => error !== null);
  return (
    <View className="gap-section-gap">
      <TextFields value={value} change={change} />
      {permissionControls ? <PermissionRows value={value} change={change} /> : null}
      <ThinkingRows value={value} change={change} />
      <SourceRows value={value} change={change} />
      <ProviderSessionOptions value={value} change={change} invalid={invalid} />
      <ProviderNumbers value={value} change={change} invalid={invalid} />
      <NativeExtensions value={value} change={change} />
      <ProviderLists value={value} change={change} invalid={invalid} />
      <ProviderFlagOptions
        value={value}
        change={change}
        invalid={invalid}
        {...(metadata === undefined ? {} : { metadata })}
      />
      <StructuredFields value={value} change={change} invalid={invalid} />
      {problems.map((problem) => (
        <Text key={problem} tone="critical">
          {problem}
        </Text>
      ))}
      <Button
        label="Save provider options"
        loading={pending}
        disabled={problems.length > 0}
        onPress={() => {
          const checked = CLAUDE_PROVIDER_OPTIONS.safeParse(value);
          if (checked.success) save(checked.data);
          else setErrors({ form: checked.error.message });
        }}
      />
    </View>
  );
}
