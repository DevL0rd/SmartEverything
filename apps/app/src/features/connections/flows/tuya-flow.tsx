import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { TUYA_SMART_LIFE_CREDENTIALS } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { FlowButton } from './flow-button';
import { LinkFlowView } from './link-flow-view';
import { useLinkFlow } from './use-link-flow';

const STEPS = ['Your User Code', 'Scan with Smart Life', 'Finding devices'] as const;

const PATH = ['Smart Life', 'Me', 'Settings', 'Account and Security', 'User Code'] as const;

function PathChips(): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-1">
      {PATH.map((step, index) => (
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

function CodeForm({
  code,
  onChange,
  onSubmit,
}: {
  readonly code: string;
  readonly onChange: (code: string) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <View className="gap-5">
      <Text variant="body" tone="variant">
        Uses your Smart Life app. No developer account.
      </Text>
      <View className="gap-2">
        <Text variant="body-strong">Find your User Code</Text>
        <PathChips />
      </View>
      <TextField
        label="User Code"
        kind="code"
        value={code}
        onChange={onChange}
        onSubmit={onSubmit}
        helper="Paste it exactly. Capitals matter."
        focusOnMount
      />
    </View>
  );
}

function Included(): ReactNode {
  return (
    <View className="gap-3 rounded-lg bg-surface-2 p-card-pad">
      <View className="flex-row items-center gap-2">
        <Icon name="circleCheck" size={20} tone="positive" />
        <Text variant="callout" className="flex-1">
          All Smart Life devices · Live updates · Local control
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Icon name="remote" size={20} tone="variant" />
        <Text variant="callout" tone="variant" className="flex-1">
          IR remotes need a developer project
        </Text>
      </View>
      <Button label="Set up IR remotes" variant="text" href={href.connect('tuya-developer')} />
    </View>
  );
}

export function TuyaFlow(): ReactNode {
  const flow = useLinkFlow('tuya');
  const [code, setCode] = useState('');
  const parsed = TUYA_SMART_LIFE_CREDENTIALS.safeParse({
    provider: 'tuya',
    method: 'smart_life',
    userCode: code,
  });
  const submit = (): void => {
    if (parsed.success) {
      flow.start(parsed.data);
    }
  };
  return (
    <LinkFlowView
      provider="tuya"
      title="Connect Smart Life"
      labels={STEPS}
      flow={flow}
      form={<CodeForm code={code} onChange={setCode} onSubmit={submit} />}
      formFooter={
        <FlowButton
          label="Continue"
          disabled={!parsed.success}
          loading={flow.sending}
          onPress={submit}
        />
      }
      doneExtra={<Included />}
    />
  );
}
