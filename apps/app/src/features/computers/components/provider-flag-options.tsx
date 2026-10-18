import type { ReactNode } from 'react';
import { z } from 'zod';
import { View } from 'react-native';
import type { ClaudeProviderOptions, ProviderMetadata } from '@smarteverything/domain';
import { SchemaSettingsSheet } from '../../../components/schema-settings-sheet';
import { Text } from '../../../components/text';
export function ProviderFlagOptions({
  value,
  metadata,
  change,
  invalid,
}: {
  readonly value: ClaudeProviderOptions;
  readonly metadata?: ProviderMetadata;
  readonly change: (value: ClaudeProviderOptions) => void;
  readonly invalid: (key: string, reason: string | null) => void;
}): ReactNode {
  const schema = metadata?.flag_settings_schema ?? {};
  if (Object.keys(schema).length === 0)
    return <Text tone="variant">More settings appear after the first reply.</Text>;
  return (
    <View className="gap-3">
      <Text variant="title-3">Advanced settings for the next session</Text>
      <SchemaSettingsSheet
        schema={schema}
        value={value.flag_settings ?? {}}
        exclusions={metadata?.flag_settings_exclusions ?? {}}
        change={(flag_settings) => {
          const checked = z.fromJSONSchema(schema).safeParse(flag_settings);
          invalid(
            'flag_settings',
            checked.success ? null : checked.error.issues.map((issue) => issue.message).join('; '),
          );
          change({ ...value, flag_settings });
        }}
      />
    </View>
  );
}
