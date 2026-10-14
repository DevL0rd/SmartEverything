import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { CLAUDE_PROVIDER_OPTIONS, type ClaudeProviderOptions } from '@smarteverything/domain';
import { TextField } from '../../../components/text-field';

const FIELDS = [
  {
    key: 'builtin_tools',
    title: 'Built-in tools',
    help: 'One exact runtime tool name per line. Empty keeps the SDK default preset.',
  },
  {
    key: 'additional_directories',
    title: 'Additional directories',
    help: 'One absolute directory on the supplying computer per line',
  },
  {
    key: 'plugins',
    title: 'Local plugins',
    help: 'One absolute plugin directory on the supplying computer per line',
  },
] as const;
type Key = (typeof FIELDS)[number]['key'];
function listText(value: ClaudeProviderOptions, key: Key): string {
  if (key === 'plugins') return (value.plugins ?? []).map((plugin) => plugin.path).join('\n');
  return (value[key] ?? []).join('\n');
}
export function ProviderLists({
  value,
  change,
  invalid,
}: {
  readonly value: ClaudeProviderOptions;
  readonly change: (value: ClaudeProviderOptions) => void;
  readonly invalid: (key: string, reason: string | null) => void;
}): ReactNode {
  const [drafts, setDrafts] = useState<Readonly<Partial<Record<Key, string>>>>({});
  return (
    <View className="gap-4">
      {FIELDS.map((field) => (
        <TextField
          key={field.key}
          label={field.title}
          helper={field.help}
          value={drafts[field.key] ?? listText(value, field.key)}
          multiline
          onChange={(text) => {
            setDrafts({ ...drafts, [field.key]: text });
            const lines = text.split('\n').filter((line) => line !== '');
            const next =
              field.key === 'plugins' ? lines.map((path) => ({ type: 'local', path })) : lines;
            const checked = CLAUDE_PROVIDER_OPTIONS.safeParse({ ...value, [field.key]: next });
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
