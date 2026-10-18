import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { claudeBillingNoticeFor } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { Disclosure } from '../../../components/disclosure';
import { Text } from '../../../components/text';
import { useRecheckProvider } from '../data/computer-ai';

export function ProviderReasonNotice({
  deviceId,
  reason,
}: {
  readonly deviceId: string;
  readonly reason: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const recheck = useRecheckProvider(deviceId);
  const notice = claudeBillingNoticeFor(reason);
  if (notice === null) return <Text tone="variant">{reason}</Text>;
  return (
    <View className="gap-1">
      <Banner
        tone={notice.tone}
        title={notice.title}
        body={notice.hint}
        wrapBody
        action={{
          label: recheck.isPending ? 'Checking…' : 'Check again',
          onPress: () => {
            if (!recheck.isPending) recheck.mutate();
          },
        }}
      />
      <Disclosure
        label="Details"
        accessibleLabel="Details about why Claude chats are paused"
        hint="Shows why Claude chats are paused"
        open={open}
        onToggle={() => {
          setOpen((current) => !current);
        }}
      >
        <Text variant="callout" tone="variant" className="px-1">
          {notice.detail}
        </Text>
      </Disclosure>
    </View>
  );
}
