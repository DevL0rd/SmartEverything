import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  PROVIDER_INFO,
  TUYA_PROJECT_CREDENTIALS,
  TUYA_REGIONS,
  TUYA_REGION_LABELS,
  type TuyaRegion,
  type XiaomiRegion,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useSettings } from '../../../store/selectors';
import { FlowButton } from './flow-button';
import { LinkFlowView } from './link-flow-view';
import { openInBrowser } from './prompt-body';
import { useLinkFlow } from './use-link-flow';

const STEPS = ['Checking the project', 'Waiting for Tuya', 'Finding remotes'] as const;

const REGION_OPTIONS = TUYA_REGIONS.map((region) => ({
  value: region,
  label: TUYA_REGION_LABELS[region],
}));

const TUYA_REGION_NEAR: Readonly<Record<XiaomiRegion, TuyaRegion>> = {
  cn: 'cn',
  de: 'eu',
  i2: 'in',
  ru: 'eu',
  sg: 'sg',
  us: 'us',
};

const CHECKLIST = [
  'Create a cloud project on iot.tuya.com',
  'Add the IR Control Hub service',
  'Link your Smart Life account under Devices',
  'Copy the values below from the project',
] as const;

interface ProjectForm {
  readonly accessId: string;
  readonly accessSecret: string;
  readonly region: TuyaRegion;
  readonly appUserId: string;
}

type Change = (form: ProjectForm) => void;

function Checklist(): ReactNode {
  return (
    <View className="gap-2">
      {CHECKLIST.map((item, index) => (
        <View key={item} className="flex-row gap-3">
          <View className="size-6 items-center justify-center rounded-full bg-primary-container">
            <Text variant="caption" tone="primary">
              {String(index + 1)}
            </Text>
          </View>
          <Text variant="callout" className="flex-1">
            {item}
          </Text>
        </View>
      ))}
      <Button
        label="Open iot.tuya.com"
        variant="text"
        icon="externalLink"
        onPress={() => {
          openInBrowser('https://iot.tuya.com/');
        }}
      />
    </View>
  );
}

function Fields({
  form,
  onChange,
}: {
  readonly form: ProjectForm;
  readonly onChange: Change;
}): ReactNode {
  return (
    <View className="gap-4">
      <TextField
        label="Access ID"
        kind="url"
        value={form.accessId}
        onChange={(accessId) => {
          onChange({ ...form, accessId });
        }}
      />
      <TextField
        label="Access Secret"
        kind="password"
        value={form.accessSecret}
        onChange={(accessSecret) => {
          onChange({ ...form, accessSecret });
        }}
      />
      <Select
        label="Data centre"
        options={REGION_OPTIONS}
        value={form.region}
        onChange={(region) => {
          onChange({ ...form, region });
        }}
      />
      <TextField
        label="App account UID"
        kind="url"
        value={form.appUserId}
        onChange={(appUserId) => {
          onChange({ ...form, appUserId });
        }}
      />
    </View>
  );
}

export function TuyaDeveloperFlow(): ReactNode {
  const flow = useLinkFlow('tuya');
  const timeZone = useSettings().time_zone;
  const [form, setForm] = useState<ProjectForm>({
    accessId: '',
    accessSecret: '',
    region: TUYA_REGION_NEAR[PROVIDER_INFO.xiaomi.regionFor(timeZone)],
    appUserId: '',
  });
  const parsed = TUYA_PROJECT_CREDENTIALS.safeParse({
    provider: 'tuya',
    method: 'developer_project',
    accessId: form.accessId.trim(),
    accessSecret: form.accessSecret.trim(),
    region: form.region,
    appUserId: form.appUserId.trim(),
  });
  return (
    <LinkFlowView
      provider="tuya"
      title="Tuya developer project"
      labels={STEPS}
      flow={flow}
      form={
        <View className="gap-6">
          <Text variant="body" tone="variant">
            Only needed for IR remotes and learning.
          </Text>
          <Checklist />
          <Fields form={form} onChange={setForm} />
        </View>
      }
      formFooter={
        <FlowButton
          label="Connect"
          disabled={!parsed.success}
          loading={flow.sending}
          onPress={() => {
            if (parsed.success) {
              flow.start(parsed.data);
            }
          }}
        />
      }
    />
  );
}
