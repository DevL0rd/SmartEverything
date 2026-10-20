import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { USER_CODE_PATH } from '../model/tuya-link';

function PathChips(): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-1">
      {USER_CODE_PATH.map((step, index) => (
        <View
          key={step}
          className="flex-row items-center gap-1 rounded-full bg-surface-2 px-3 py-1"
        >
          {index === 0 ? null : <Icon name="chevronRight" size={16} tone="faint" />}
          <Text variant="caption">{step}</Text>
        </View>
      ))}
    </View>
  );
}

export function TuyaCodeCard({
  code,
  onChange,
  onSubmit,
}: {
  readonly code: string;
  readonly onChange: (code: string) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <Card title="Your User Code" icon="key">
      <View className="gap-5">
        <Text variant="body" tone="variant">
          Link once with Smart Life. Next time, a scan is all it takes.
        </Text>
        <View className="gap-2">
          <Text variant="body-strong">Find it in the app</Text>
          <PathChips />
        </View>
        <TextField
          label="User Code"
          kind="code"
          value={code}
          onChange={onChange}
          onSubmit={onSubmit}
          helper="Paste it exactly. Capital letters matter."
          focusOnMount
        />
      </View>
    </Card>
  );
}
