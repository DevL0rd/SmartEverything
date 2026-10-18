import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fitnessReady, type ProfileRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useEntityStore } from '../../../store/store-context';
import { useActiveProfile } from '../../../store/people';
import { List } from '../../../components/section';
import { BodyDetails } from '../../profiles';
import { writeFitnessSettings } from '../data/settings-write';
import { SetupConnect } from './setup-connect';
import { SetupGoals, startingGoals, type GoalDraft } from './setup-goals';

const STEPS = ['about', 'goals', 'connect'] as const;

type Step = (typeof STEPS)[number];

const LABELS: Readonly<Record<Step, string>> = {
  about: 'About you',
  goals: 'Goals',
  connect: 'Connect',
};

function firstStep(param: string | undefined): Step {
  return STEPS.find((step) => step === param) ?? 'about';
}

function About({ profile }: { readonly profile: ProfileRow }): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Needed for body composition, calories and heart-rate zones.
      </Text>
      <List inset>
        <BodyDetails profile={profile} />
      </List>
    </View>
  );
}

function Flow({
  profile,
  start,
}: {
  readonly profile: ProfileRow;
  readonly start: Step;
}): ReactNode {
  const router = useRouter();
  const store = useEntityStore();
  const [step, setStep] = useState<Step>(start);
  const [goals, setGoals] = useState<GoalDraft | null>(() =>
    start === 'about' ? null : startingGoals(profile, new Date()),
  );
  const close = (): void => {
    router.back();
  };
  const next = (): void => {
    if (step === 'goals' && goals !== null) {
      writeFitnessSettings(store, { goals }).catch(notifyFailure('Your goals were not saved'));
    }
    if (step === 'connect') {
      close();
      return;
    }
    if (step === 'about') {
      setGoals(startingGoals(profile, new Date()));
    }
    setStep(step === 'about' ? 'goals' : 'connect');
  };
  const ready = fitnessReady(profile);
  return (
    <FlowFrame
      title={`${LABELS[step]} · ${String(STEPS.indexOf(step) + 1)} of ${String(STEPS.length)}`}
      onCancel={close}
      footer={
        <Button label={step === 'connect' ? 'Done' : 'Next'} disabled={!ready} onPress={next} />
      }
    >
      {step === 'about' ? <About profile={profile} /> : null}
      {step === 'goals' && goals !== null ? <SetupGoals goals={goals} onGoals={setGoals} /> : null}
      {step === 'connect' ? <SetupConnect /> : null}
    </FlowFrame>
  );
}

export function FitnessSetupFlow(): ReactNode {
  const router = useRouter();
  const profile = useActiveProfile();
  const { step } = useLocalSearchParams<{ step?: string }>();
  if (profile === null) {
    return (
      <FlowFrame
        title="Set up Fitness"
        onCancel={() => {
          router.replace(href.fitness());
        }}
      >
        <EmptyState icon="users" title="No profile" body="This app has no profile yet." />
      </FlowFrame>
    );
  }
  return <Flow profile={profile} start={fitnessReady(profile) ? firstStep(step) : 'about'} />;
}
