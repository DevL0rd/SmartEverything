import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { ErrorState } from '../../../components/error-state';
import { FlowFrame } from '../../../components/flow-frame';
import { ProgressSteps, stepsAt } from '../../../components/progress-steps';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useSmartThingsApp } from '../../../api/smartthings';
import { useProviderLink, useSmartThingsWebhook } from '../../../store/selectors';
import { stageOf, type LinkStage } from '../model/link-stage';
import { problemTitle } from '../model/problems';
import { FlowButton } from './flow-button';
import { LinkDone } from './link-flow-view';
import { RemoteAccessGate, UnverifiedAddressNotice } from './remote-access-gate';
import { SmartThingsFooter } from './smartthings-footer';
import { TokenStep } from './smartthings-token';
import { leaveFlow } from './leave-flow';
import { useSmartThingsFlow, type SmartThingsFlow } from './use-smartthings-flow';
import { background } from '@smarteverything/logging';

const LABELS = [
  'Creating the app',
  'Confirming the webhook',
  'Sign in to Samsung',
  'Finding devices',
] as const;

function signInIndex(stage: LinkStage): number {
  return stage.kind === 'working' && stage.phase === 'discovering' ? 3 : 2;
}

function Creating({ confirmedBefore }: { readonly confirmedBefore: string | null }): ReactNode {
  const confirmedAt = useSmartThingsWebhook()?.confirmedAt ?? null;
  const confirmed = confirmedAt !== null && confirmedAt !== confirmedBefore;
  return <ProgressSteps steps={stepsAt(LABELS, confirmed ? 2 : 0)} />;
}

function SignIn({ baseline }: { readonly baseline: string | null }): ReactNode {
  const row = useProviderLink('smartthings');
  const stage = stageOf(row, { baseline });
  if (stage.kind === 'done') {
    return <LinkDone row={stage.row} extra={null} />;
  }
  if (stage.kind === 'failed') {
    return <Banner tone="critical" title={problemTitle('smartthings', stage.problem)} />;
  }
  return <ProgressSteps steps={stepsAt(LABELS, signInIndex(stage))} />;
}

function Body({ flow }: { readonly flow: SmartThingsFlow }): ReactNode {
  const { step } = flow;
  switch (step.kind) {
    case 'token':
      return (
        <TokenStep
          token={flow.token}
          onToken={flow.setToken}
          onSubmit={flow.run}
          notice={step.notice}
          missing={step.missing}
        />
      );
    case 'creating':
      return <Creating confirmedBefore={step.confirmedBefore} />;
    case 'not_confirmed':
      return (
        <View className="gap-3">
          <Banner tone="critical" title="SmartThings couldn’t reach your server" />
          <Text variant="footnote" tone="variant">
            {step.reason}
          </Text>
        </View>
      );
    case 'signin':
      return <SignIn baseline={step.baseline} />;
  }
}

function Gate({ state }: { readonly state: ReturnType<typeof useSmartThingsApp> }): ReactNode {
  if (state.isPending) {
    return <Skeleton shape="block" />;
  }
  if (state.isError) {
    return (
      <ErrorState
        error={state.error}
        retry={() => {
          background(state.refetch(), 'state.refetch_failed');
        }}
      />
    );
  }
  return <RemoteAccessGate who="SmartThings" />;
}

export function SmartThingsFlow(): ReactNode {
  const app = useSmartThingsApp();
  const flow = useSmartThingsFlow();
  const address = app.data?.publicUrl;
  const ready = address === 'verified' || address === 'unverified';
  return (
    <FlowFrame
      title="Connect SmartThings"
      onCancel={leaveFlow}
      footer={
        ready ? (
          <SmartThingsFooter flow={flow} />
        ) : (
          <FlowButton label="Close" variant="text" onPress={leaveFlow} />
        )
      }
    >
      {ready ? (
        <View className="gap-4">
          {address === 'unverified' ? <UnverifiedAddressNotice /> : null}
          <Body flow={flow} />
        </View>
      ) : (
        <Gate state={app} />
      )}
    </FlowFrame>
  );
}
