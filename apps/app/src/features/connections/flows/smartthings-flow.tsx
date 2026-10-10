import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { ErrorState } from '../../../components/error-state';
import { FlowFrame } from '../../../components/flow-frame';
import { ProgressSteps, type ProgressStep } from '../../../components/progress-steps';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useSmartThingsApp } from '../../../api/smartthings';
import { useProviderLink, useSmartThingsWebhook } from '../../../store/selectors';
import { stageOf, type LinkStage } from '../model/link-stage';
import { problemTitle } from '../model/problems';
import { FlowButton } from './flow-button';
import { LinkDone } from './link-flow-view';
import { RemoteAccessGate } from './remote-access-gate';
import { SmartThingsFooter } from './smartthings-footer';
import { TokenStep } from './smartthings-token';
import { closeFlow } from './use-link-flow';
import { useSmartThingsFlow, type SmartThingsFlow } from './use-smartthings-flow';

const LABELS = [
  'Creating the app',
  'Confirming the webhook',
  'Sign in to Samsung',
  'Finding devices',
] as const;

function stepsAt(current: number): readonly ProgressStep[] {
  return LABELS.map((label, index) => ({
    label,
    state: index < current ? 'done' : index === current ? 'active' : 'waiting',
  }));
}

function signInIndex(stage: LinkStage): number {
  return stage.kind === 'working' && stage.phase === 'discovering' ? 3 : 2;
}

function Creating({ confirmedBefore }: { readonly confirmedBefore: string | null }): ReactNode {
  const confirmedAt = useSmartThingsWebhook()?.confirmedAt ?? null;
  const confirmed = confirmedAt !== null && confirmedAt !== confirmedBefore;
  return <ProgressSteps steps={stepsAt(confirmed ? 2 : 0)} />;
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
  return <ProgressSteps steps={stepsAt(signInIndex(stage))} />;
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
    return <ErrorState error={state.error} retry={() => void state.refetch()} />;
  }
  return <RemoteAccessGate who="SmartThings" />;
}

export function SmartThingsFlow(): ReactNode {
  const app = useSmartThingsApp();
  const flow = useSmartThingsFlow();
  const ready = app.data?.publicUrl === 'verified';
  return (
    <FlowFrame
      title="Connect SmartThings"
      onCancel={closeFlow}
      footer={
        ready ? (
          <SmartThingsFooter flow={flow} />
        ) : (
          <FlowButton label="Close" variant="text" onPress={closeFlow} />
        )
      }
    >
      {ready ? <Body flow={flow} /> : <Gate state={app} />}
    </FlowFrame>
  );
}
