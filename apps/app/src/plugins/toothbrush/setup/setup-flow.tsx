import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { isBrushLinked } from '../../../../modules/health-connect';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { stepsAt } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { useRooms } from '../../../store/selectors';
import type { BrushBrand } from '@smarteverything/domain';
import { brandUi } from '../brands';
import { canAdd, canContinue, stepAnnouncement, stepLabels } from '../model/setup-model';
import { DetailsStep } from './details-step';
import { ChooseStep, VerifyStep, WakeStep } from './find-steps';
import { CheckStep, PermissionStep } from './intro-steps';
import { useSetup, type Setup } from './use-setup';

function Details({ setup }: { readonly setup: Setup }): ReactNode {
  const rooms = useRooms();
  const { state, dispatch } = setup;
  return state.dump === null ? null : (
    <DetailsStep
      dump={state.dump}
      name={setup.name}
      room={setup.room}
      rooms={rooms.map((room) => ({ value: room.name, label: room.name }))}
      modelKey={state.modelKey}
      problem={setup.add.problem}
      onName={setup.setName}
      onRoom={setup.setRoom}
      onModel={(key) => {
        dispatch({ type: 'model', key });
      }}
    />
  );
}

function Body({ brand, setup }: { readonly brand: BrushBrand; readonly setup: Setup }): ReactNode {
  const { state, dispatch } = setup;
  const { PairStep } = brandUi(brand).setupSteps;
  switch (state.step) {
    case 'check':
      return (
        <CheckStep
          closed={state.philipsClosed}
          onToggle={(value) => {
            dispatch({ type: 'closed', value });
          }}
        />
      );
    case 'allow':
      return <PermissionStep denied={state.permission === 'denied'} onAllow={setup.allow} />;
    case 'wake':
      return (
        <WakeStep
          candidates={state.candidates}
          picked={state.picked}
          onPick={(address) => {
            dispatch({ type: 'pick', address });
          }}
        />
      );
    case 'choose':
      return (
        <ChooseStep
          progress={setup.choose}
          done={state.associated !== null}
          onChoose={setup.chooseNow}
        />
      );
    case 'pair':
      return PairStep === null ? null : (
        <PairStep state={state} progress={setup.pair} onPair={setup.pairNow} />
      );
    case 'verify':
      return (
        <VerifyStep progress={setup.verify} done={state.dump !== null} onVerify={setup.verifyNow} />
      );
    case 'details':
      return <Details setup={setup} />;
  }
}

function Footer({ setup }: { readonly setup: Setup }): ReactNode {
  const { state, dispatch } = setup;
  return (
    <>
      {state.step === 'check' ? null : (
        <Button
          label="Back"
          variant="text"
          onPress={() => {
            dispatch({ type: 'back' });
          }}
        />
      )}
      {state.step === 'details' ? (
        <Button
          label="Add toothbrush"
          loading={setup.add.busy}
          disabled={!canAdd(state)}
          onPress={setup.add.start}
        />
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

function Flow({ brand }: { readonly brand: BrushBrand }): ReactNode {
  const router = useRouter();
  const setup = useSetup(brand);
  const index = setup.state.steps.indexOf(setup.state.step);
  return (
    <FlowFrame
      title="Add a toothbrush"
      steps={stepsAt(stepLabels(setup.state.steps), index)}
      footer={<Footer setup={setup} />}
      onCancel={() => {
        router.back();
      }}
    >
      <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
        {stepAnnouncement(setup.state.step, setup.state.steps)}
      </Text>
      <Body brand={brand} setup={setup} />
    </FlowFrame>
  );
}

export function BrushSetupFlow({ brand }: { readonly brand: BrushBrand }): ReactNode {
  const router = useRouter();
  if (isBrushLinked) {
    return <Flow brand={brand} />;
  }
  return (
    <FlowFrame
      title="Add a toothbrush"
      onCancel={() => {
        router.back();
      }}
    >
      <EmptyState
        icon="bluetooth"
        title="Use the Android app"
        body="A toothbrush is added from an Android phone that can reach it over Bluetooth. Open SmartEverything on that phone and add it there."
      />
    </FlowFrame>
  );
}
