import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { isBottleLinked } from '../../../../modules/health-connect';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { stepsAt } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { ChooseStep } from './choose-step';
import { canContinue, STEP_LABELS, STEPS, stepAnnouncement } from './setup-model';
import { FindStep, PermissionStep, ReadStep } from './setup-steps';
import { useSetup, type Setup } from './use-setup';

function Body({ setup }: { readonly setup: Setup }): ReactNode {
  const { state, dispatch } = setup;
  switch (state.step) {
    case 'permission':
      return <PermissionStep denied={state.permission === 'denied'} onAllow={setup.allow} />;
    case 'find':
      return (
        <FindStep
          candidates={state.candidates}
          picked={state.picked}
          onPick={(address) => {
            dispatch({ type: 'pick', address });
          }}
        />
      );
    case 'read':
      return <ReadStep status={setup.read} onRead={setup.readNow} />;
    case 'choose':
      return <ChooseStep setup={setup} />;
  }
}

function Footer({ setup }: { readonly setup: Setup }): ReactNode {
  const { state, dispatch } = setup;
  return (
    <>
      {state.step === 'permission' || state.step === 'find' ? null : (
        <Button
          label="Back"
          variant="text"
          onPress={() => {
            dispatch({ type: 'back' });
          }}
        />
      )}
      {state.step === 'choose' ? (
        <Button label="Add bottle" loading={setup.add.busy} onPress={setup.add.start} />
      ) : (
        <Button
          label="Next"
          disabled={!canContinue(state)}
          onPress={() => {
            dispatch({ type: 'next' });
          }}
        />
      )}
    </>
  );
}

function Flow(): ReactNode {
  const router = useRouter();
  const setup = useSetup();
  return (
    <FlowFrame
      title="Add a water bottle"
      steps={stepsAt(STEP_LABELS, STEPS.indexOf(setup.state.step))}
      footer={<Footer setup={setup} />}
      onCancel={() => {
        router.back();
      }}
    >
      <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
        {stepAnnouncement(setup.state.step)}
      </Text>
      <Body setup={setup} />
    </FlowFrame>
  );
}

export function BottleSetupFlow(): ReactNode {
  const router = useRouter();
  if (isBottleLinked) {
    return <Flow />;
  }
  return (
    <FlowFrame
      title="Add a water bottle"
      onCancel={() => {
        router.back();
      }}
    >
      <EmptyState
        icon="bluetooth"
        title="Use the Android app"
        body="A bottle is added from an Android phone that can reach it over Bluetooth. Open SmartEverything on that phone and add it there."
      />
    </FlowFrame>
  );
}
