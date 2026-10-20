import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { isTreadmillLinked } from '../../../../modules/health-connect';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { stepsAt } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { useRooms } from '../../../store/selectors';
import { NameStep, ReadStep } from './read-name-steps';
import { canContinue, STEP_LABELS, STEPS, stepAnnouncement } from './setup-model';
import { CheckStep, PermissionStep, ScanStep } from './setup-steps';
import { useSetup, type Setup } from './use-setup';

function Body({ setup }: { readonly setup: Setup }): ReactNode {
  const rooms = useRooms();
  const { state, dispatch } = setup;
  switch (state.step) {
    case 'permission':
      return <PermissionStep denied={state.permission === 'denied'} onAllow={setup.allow} />;
    case 'scan':
      return (
        <ScanStep
          candidates={state.candidates}
          picked={state.picked}
          onPick={(address) => {
            dispatch({ type: 'pick', address });
          }}
        />
      );
    case 'check':
      return (
        <CheckStep
          closed={state.closedKsFit}
          onToggle={(value) => {
            dispatch({ type: 'closed', value });
          }}
        />
      );
    case 'read':
      return <ReadStep status={setup.read} onRead={setup.readNow} />;
    case 'name':
      return (
        <View className="gap-4">
          <NameStep
            name={setup.name}
            room={setup.room}
            rooms={rooms.map((room) => ({ value: room.name, label: room.name }))}
            onName={setup.setName}
            onRoom={setup.setRoom}
          />
          {setup.add.problem === null ? null : (
            <Banner
              tone="critical"
              title="Could not add the treadmill"
              body={setup.add.problem}
              wrapBody
            />
          )}
        </View>
      );
  }
}

function Footer({ setup }: { readonly setup: Setup }): ReactNode {
  const { state, dispatch } = setup;
  return (
    <>
      {state.step === 'permission' || state.step === 'scan' ? null : (
        <Button
          label="Back"
          variant="text"
          onPress={() => {
            dispatch({ type: 'back' });
          }}
        />
      )}
      {state.step === 'name' ? (
        <Button label="Add treadmill" loading={setup.add.busy} onPress={setup.add.start} />
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
  const index = STEPS.indexOf(setup.state.step);
  return (
    <FlowFrame
      title="Add a treadmill"
      steps={stepsAt(STEP_LABELS, index)}
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

export function TreadmillSetupFlow(): ReactNode {
  const router = useRouter();
  if (isTreadmillLinked) {
    return <Flow />;
  }
  return (
    <FlowFrame
      title="Add a treadmill"
      onCancel={() => {
        router.back();
      }}
    >
      <EmptyState
        icon="bluetooth"
        title="Use the Android app"
        body="A treadmill is added from an Android phone that can reach it over Bluetooth. Open SmartEverything on that phone and add it there."
      />
    </FlowFrame>
  );
}
