import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { CLAUDE_PROVIDER_OPTIONS, type ClaudeProviderOptions } from '@smarteverything/domain';
import { TextField } from '../../../components/text-field';

const FIELDS = [
  { key: 'thinking_budget', label: 'Thinking budget' },
  { key: 'max_turns', label: 'Maximum turns' },
  { key: 'max_budget_usd', label: 'Maximum budget (USD)' },
] as const;
export function ProviderNumbers({
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
      {FIELDS.map((field) => (
        <TextField
          key={field.key}
          label={field.label}
          kind="number"
          value={
            drafts[field.key] ?? (value[field.key] === undefined ? '' : String(value[field.key]))
          }
          onChange={(text) => {
            setDrafts({ ...drafts, [field.key]: text });
            const rest = Object.fromEntries(
              Object.entries(value).filter(([name]) => name !== field.key),
            );
            const checked = CLAUDE_PROVIDER_OPTIONS.safeParse(
              text === '' ? rest : { ...rest, [field.key]: Number(text) },
            );
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
