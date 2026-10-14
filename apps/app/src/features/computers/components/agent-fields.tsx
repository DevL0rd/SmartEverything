import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CLAUDE_SETTABLE_MODES } from '@smarteverything/domain';
import { TextField } from '../../../components/text-field';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';

export interface AgentFieldsProps {
  readonly value: Readonly<Record<string, unknown>>;
  readonly change: (value: Readonly<Record<string, unknown>>) => void;
}
const TEXT = [
  ['description', 'Description', 'Describe when to use this agent'],
  ['prompt', 'Agent instructions', 'Instructions for this agent'],
  ['model', 'Agent model', 'Exact native model ID, sonnet, opus, haiku, or inherit'],
  ['initialPrompt', 'Initial prompt', 'Optional initial agent prompt'],
  ['observer', 'Observer', 'Optional observer agent name'],
  ['observerMessage', 'Observer message', 'Optional observer instructions'],
  [
    'criticalSystemReminder_EXPERIMENTAL',
    'Critical system reminder',
    'Experimental native SDK reminder',
  ],
] as const;
const LISTS = [
  ['tools', 'Allowed tools'],
  ['disallowedTools', 'Disallowed tools'],
  ['skills', 'Skills'],
] as const;
const NUMBERS = [
  ['maxTurns', 'Maximum agent turns'],
  ['autoCompactWindow', 'Auto compact window'],
] as const;
function patch(
  value: AgentFieldsProps['value'],
  key: string,
  next: unknown,
): AgentFieldsProps['value'] {
  const rest = Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
  return next === undefined ? rest : { ...rest, [key]: next };
}
function textOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function AgentText({ value, change }: AgentFieldsProps): ReactNode {
  return (
    <View className="gap-4">
      {TEXT.map(([key, label, helper]) => (
        <TextField
          key={key}
          label={label}
          helper={helper}
          value={textOf(value[key])}
          multiline={key !== 'model' && key !== 'observer'}
          onChange={(text) => {
            change(patch(value, key, text === '' ? undefined : text));
          }}
        />
      ))}
      {LISTS.map(([key, label]) => (
        <TextField
          key={key}
          label={label}
          helper="One exact name per line; empty uses runtime defaults"
          value={Array.isArray(value[key]) ? value[key].join('\n') : ''}
          multiline
          onChange={(text) => {
            change(patch(value, key, text === '' ? undefined : text.split('\n').filter(Boolean)));
          }}
        />
      ))}
      {NUMBERS.map(([key, label]) => (
        <TextField
          key={key}
          label={label}
          kind="number"
          value={textOf(value[key])}
          onChange={(text) => {
            change(patch(value, key, text === '' ? undefined : text));
          }}
        />
      ))}
    </View>
  );
}
function AgentModes({ value, change }: AgentFieldsProps): ReactNode {
  return (
    <List title="Agent execution">
      <SelectRow
        title="Memory scope"
        value={textOf(value['memory']) || null}
        options={['user', 'project', 'local'].map((item) => ({ value: item, label: item }))}
        onChange={(memory) => {
          change(patch(value, 'memory', memory));
        }}
      />
      <SelectRow
        title="Agent permission mode"
        value={textOf(value['permissionMode']) || null}
        options={CLAUDE_SETTABLE_MODES.map((item) => ({ value: item, label: item }))}
        onChange={(mode) => {
          change(patch(value, 'permissionMode', mode));
        }}
      />
      <TextField
        label="Agent effort"
        helper="low, medium, high, xhigh, max, or a nonnegative integer"
        value={textOf(value['effort'])}
        onChange={(text) => {
          change(patch(value, 'effort', text === '' ? undefined : text));
        }}
      />
      <SwitchRow
        title="Run in background"
        value={value['background'] === true}
        onChange={(background) => {
          change(patch(value, 'background', background));
        }}
      />
      <SwitchRow
        title="Omit CLAUDE.md"
        value={value['omitClaudeMd'] === true}
        onChange={(omit) => {
          change(patch(value, 'omitClaudeMd', omit));
        }}
      />
    </List>
  );
}
export function AgentFields(props: AgentFieldsProps): ReactNode {
  return (
    <>
      <AgentText {...props} />
      <AgentModes {...props} />
    </>
  );
}

export function agentDraft(value: AgentFieldsProps['value']): AgentFieldsProps['value'] {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      const numeric =
        key === 'maxTurns' ||
        key === 'autoCompactWindow' ||
        (key === 'effort' && typeof entry === 'string' && /^\d+$/.test(entry));
      return [key, numeric && typeof entry === 'string' ? Number(entry) : entry];
    }),
  );
}
