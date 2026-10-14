import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { CLAUDE_PROVIDER_OPTIONS, type ClaudeProviderOptions } from '@smarteverything/domain';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextField } from '../../../components/text-field';
interface Props {
  readonly value: ClaudeProviderOptions;
  readonly change: (value: ClaudeProviderOptions) => void;
  readonly invalid: (key: string, reason: string | null) => void;
}
const BOOLEANS = [
  ['persist_session', 'Persist provider session', 'Save the native session for later resume'],
  ['prompt_suggestions', 'Prompt suggestions', 'Request native next-prompt suggestions'],
  ['agent_progress_summaries', 'Agent progress summaries', 'Request summaries while agents work'],
] as const;
function ResumeFields({ value, change, invalid }: Props): ReactNode {
  const [draft, setDraft] = useState(value.resume_session_at ?? '');
  return (
    <View className="gap-4">
      <TextField
        label="Main agent"
        helper="Exact configured or discovered native agent name"
        value={value.agent ?? ''}
        onChange={(agent) => {
          const rest = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'agent'));
          change(CLAUDE_PROVIDER_OPTIONS.parse(agent === '' ? rest : { ...rest, agent }));
        }}
      />
      <TextField
        label="Resume at message UUID"
        helper="Resume through this native session message; requires a valid UUID"
        value={draft}
        onChange={(text) => {
          setDraft(text);
          const rest = Object.fromEntries(
            Object.entries(value).filter(([key]) => key !== 'resume_session_at'),
          );
          const checked = CLAUDE_PROVIDER_OPTIONS.safeParse(
            text === '' ? rest : { ...rest, resume_session_at: text },
          );
          invalid(
            'resume_session_at',
            checked.success ? null : 'Resume message must be a valid UUID.',
          );
          if (checked.success) change(checked.data);
        }}
      />
    </View>
  );
}
export function ProviderSessionOptions(props: Props): ReactNode {
  const { value, change } = props;
  return (
    <>
      <ResumeFields {...props} />
      <List
        title="Native session behavior"
        footer="Agent, resume and session configuration changes require closing the active provider before resume, to preserve background work."
      >
        {BOOLEANS.map(([key, title, subtitle]) => (
          <SwitchRow
            key={key}
            title={title}
            subtitle={subtitle}
            value={value[key] ?? key === 'persist_session'}
            onChange={(enabled) => {
              change({ ...value, [key]: enabled });
            }}
          />
        ))}
        <SelectRow
          title="Permission prompt host"
          value={value.permission_prompts ?? null}
          options={['host', 'none'].map((item) => ({ value: item, label: item }))}
          onChange={(permission_prompts) => {
            const checked = CLAUDE_PROVIDER_OPTIONS.safeParse({ ...value, permission_prompts });
            if (checked.success) change(checked.data);
          }}
        />
      </List>
    </>
  );
}
