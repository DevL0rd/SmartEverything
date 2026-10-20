import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ProviderLinkRow } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useProviderLink } from '../../../store/selectors';
import { failureOf } from '../model/tuya-link';
import { FlowButton } from './flow-button';
import { LinkFlowView } from './link-flow-view';
import { TuyaCodeCard } from './tuya-code-card';
import { TuyaQr } from './tuya-qr';
import { useTuyaLink, type TuyaLink } from './use-tuya-link';

const STEPS = ['Your User Code', 'Scan with Smart Life', 'Finding devices'] as const;

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
          IR blasters learn and send codes
        </Text>
      </View>
    </View>
  );
}

function Preparing({ sending }: { readonly sending: boolean }): ReactNode {
  return (
    <Card title="Sign in again" icon="qr">
      <Text variant="body" tone="variant">
        {sending
          ? 'Getting your sign-in code…'
          : 'Get a new code, then scan it with Smart Life. Your devices return as soon as you do.'}
      </Text>
    </Card>
  );
}

function failedView(
  link: TuyaLink,
  row: ProviderLinkRow | null,
): { body: ReactNode; footer: ReactNode } {
  const failure = failureOf(row?.problem ?? 'unknown', row?.last_error ?? null);
  return {
    body: <Banner tone="critical" title={failure.title} body={failure.body} wrapBody />,
    footer: (
      <FlowButton
        label={failure.actionLabel}
        onPress={() => {
          link.act(failure.action);
        }}
      />
    ),
  };
}

export function TuyaFlow(): ReactNode {
  const link = useTuyaLink();
  const row = useProviderLink('tuya');
  const { flow } = link;
  return (
    <LinkFlowView
      provider="tuya"
      title="Connect Smart Life"
      labels={STEPS}
      flow={flow}
      wide
      form={
        link.scanOnly ? (
          <Preparing sending={flow.sending} />
        ) : (
          <TuyaCodeCard code={link.code} onChange={link.setCode} onSubmit={link.submitCode} />
        )
      }
      formFooter={
        link.scanOnly ? (
          <FlowButton label="Get a code" loading={flow.sending} onPress={link.requestScan} />
        ) : (
          <FlowButton
            label="Continue"
            disabled={!link.codeReady}
            loading={flow.sending}
            onPress={link.submitCode}
          />
        )
      }
      renderScan={(prompt) => (
        <TuyaQr
          app={prompt.app}
          content={prompt.content}
          onDifferentAccount={link.differentAccount}
        />
      )}
      failed={failedView(link, row)}
      doneExtra={<Included />}
    />
  );
}
