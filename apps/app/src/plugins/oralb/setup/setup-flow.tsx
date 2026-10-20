import { ORALB_DEFAULT_NAME } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Button } from '../../../components/button';
import { FlowFrame } from '../../../components/flow-frame';
import { stepsAt } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { useProfiles } from '../../../store/people';
import { useRooms } from '../../../store/selectors';
import { canContinue, stepAnnouncement, stepLabels } from '../../toothbrush/model/setup-model';
import { ChooseStep } from '../../toothbrush/setup/find-steps';
import { PermissionStep } from '../../toothbrush/setup/intro-steps';
import { useSetup, type Setup } from '../../toothbrush/setup/use-setup';
import { OralbCheckStep } from './check-step';
import { OralbDetailsStep } from './details-step';
import { ringHexOf } from './dump-reading';
import { useOralbForm, type OralbForm } from './use-oralb-add';
import { OralbVerifyStep } from './verify-step';
import { OralbWakeStep } from './wake-step';

function Details({ setup, form }: { readonly setup: Setup; readonly form: OralbForm }): ReactNode {
  const rooms = useRooms();
  const profiles = useProfiles();
  const { dump } = setup.state;
  return (
    <OralbDetailsStep
      name={form.name}
      room={form.room}
      rooms={rooms.map((room) => ({ value: room.name, label: room.name }))}
      model={form.model}
      person={form.person}
      people={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
      ring={dump === null ? null : ringHexOf(dump)}
      problem={form.add.problem}
      onName={form.setName}
      onRoom={form.setRoom}
      onModel={form.setModel}
      onPerson={form.setPerson}
    />
  );
}

function Body({ setup, form }: { readonly setup: Setup; readonly form: OralbForm }): ReactNode {
  const { state, dispatch } = setup;
  switch (state.step) {
    case 'check':
      return (
        <OralbCheckStep
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
        <OralbWakeStep
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
    case 'verify':
      return (
        <OralbVerifyStep
          progress={setup.verify}
          dump={state.dump}
          heard={form.heard}
          onVerify={setup.verifyNow}
        />
      );
    case 'details':
      return <Details setup={setup} form={form} />;
    case 'pair':
      return null;
  }
}

function Footer({ setup, form }: { readonly setup: Setup; readonly form: OralbForm }): ReactNode {
  const { state, dispatch } = setup;
  const verified = state.step !== 'verify' || form.identity?.ok === true;
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
          loading={form.add.busy}
          disabled={form.identity?.ok !== true || form.name === ''}
          onPress={form.add.start}
        />
      ) : (
        <Button
          label="Next"
          disabled={!canContinue(state) || !verified}
          onPress={() => {
            dispatch({ type: 'next' });
          }}
        />
      )}
    </>
  );
}

export function OralbSetupFlow(): ReactNode {
  const router = useRouter();
  const setup = useSetup('oralb');
  const form = useOralbForm(setup.state);
  const index = setup.state.steps.indexOf(setup.state.step);
  return (
    <FlowFrame
      title={`Add ${ORALB_DEFAULT_NAME}`}
      steps={stepsAt(stepLabels(setup.state.steps), index)}
      footer={<Footer setup={setup} form={form} />}
      onCancel={() => {
        router.back();
      }}
    >
      <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
        {stepAnnouncement(setup.state.step, setup.state.steps)}
      </Text>
      <Body setup={setup} form={form} />
    </FlowFrame>
  );
}
