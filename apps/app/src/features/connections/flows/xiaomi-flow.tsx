import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  PROVIDER_INFO,
  XIAOMI_CREDENTIALS,
  XIAOMI_REGIONS,
  XIAOMI_REGION_LABELS,
  type XiaomiRegion,
} from '@smarteverything/domain';
import { FlowButton } from './flow-button';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useSettings } from '../../../store/selectors';
import { LinkFlowView } from './link-flow-view';
import { useLinkFlow } from './use-link-flow';

const REGION_OPTIONS = XIAOMI_REGIONS.map((region) => ({
  value: region,
  label: XIAOMI_REGION_LABELS[region],
}));

const STEPS = ['Signing in', 'Verifying', 'Finding devices'] as const;

interface XiaomiForm {
  readonly username: string;
  readonly password: string;
  readonly region: XiaomiRegion;
}

function FormFields({
  form,
  onChange,
  onSubmit,
}: {
  readonly form: XiaomiForm;
  readonly onChange: (form: XiaomiForm) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <TextField
        label="Account"
        kind="email"
        placeholder="Email, phone or Xiaomi ID"
        value={form.username}
        onChange={(username) => {
          onChange({ ...form, username });
        }}
        focusOnMount
      />
      <TextField
        label="Password"
        kind="password"
        value={form.password}
        onChange={(password) => {
          onChange({ ...form, password });
        }}
        onSubmit={onSubmit}
      />
      <Select
        label="Region"
        options={REGION_OPTIONS}
        value={form.region}
        onChange={(region) => {
          onChange({ ...form, region });
        }}
      />
      <Text variant="footnote" tone="variant">
        Your password goes only to your server.
      </Text>
    </View>
  );
}

export function XiaomiFlow(): ReactNode {
  const flow = useLinkFlow('xiaomi');
  const timeZone = useSettings().time_zone;
  const [form, setForm] = useState<XiaomiForm>({
    username: '',
    password: '',
    region: PROVIDER_INFO.xiaomi.regionFor(timeZone),
  });
  const parsed = XIAOMI_CREDENTIALS.safeParse({
    provider: 'xiaomi',
    username: form.username.trim(),
    password: form.password,
    region: form.region,
  });
  const submit = (): void => {
    if (parsed.success) {
      flow.start(parsed.data);
    }
  };
  return (
    <LinkFlowView
      provider="xiaomi"
      title="Sign in to Xiaomi"
      labels={STEPS}
      flow={flow}
      form={<FormFields form={form} onChange={setForm} onSubmit={submit} />}
      formFooter={
        <FlowButton
          label="Sign in"
          disabled={!parsed.success}
          loading={flow.sending}
          onPress={submit}
        />
      }
    />
  );
}
