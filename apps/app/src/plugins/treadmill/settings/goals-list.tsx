import type { TreadmillGoals } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useTreadmillAct } from '../data/treadmill-act';
import { Anchored } from './anchored';
import { StepperRow, type StepRange } from './rows';
import type { SettingsProps } from './settings-props';

const MINUTES: StepRange = { min: 5, max: 300, step: 5 };
const KM: StepRange = { min: 1, max: 200, step: 1 };
const SESSIONS: StepRange = { min: 1, max: 14, step: 1 };
const STEPS: StepRange = { min: 1000, max: 50_000, step: 500 };
const KCAL: StepRange = { min: 50, max: 3000, step: 50 };
const DEFAULT_STEPS = 6000;
const DEFAULT_KCAL = 300;

type Change = Partial<TreadmillGoals>;

function useGoalSetter(deviceId: string): (change: Change) => void {
  const { act } = useTreadmillAct(deviceId);
  return (change): void => {
    act({ action: 'set_goal', goals: change }, 'The goal could not be saved');
  };
}

function MinutesRow({ deviceId, settings }: SettingsProps): ReactNode {
  const set = useGoalSetter(deviceId);
  return (
    <Anchored deviceId={deviceId} id="goals" label="Minutes a day">
      <StepperRow
        title="Minutes a day"
        value={settings.goals.dailyMinutes}
        range={MINUTES}
        unit="min"
        onChange={(next) => {
          set({ dailyMinutes: next });
        }}
      />
    </Anchored>
  );
}

function DistanceRow({ deviceId, settings }: SettingsProps): ReactNode {
  const set = useGoalSetter(deviceId);
  return (
    <StepperRow
      title="Distance a week"
      value={settings.goals.weeklyKm}
      range={KM}
      unit="km"
      onChange={(next) => {
        set({ weeklyKm: next });
      }}
    />
  );
}

function SessionsRow({ deviceId, settings }: SettingsProps): ReactNode {
  const set = useGoalSetter(deviceId);
  return (
    <StepperRow
      title="Sessions a week"
      value={settings.goals.weeklySessions}
      range={SESSIONS}
      unit=""
      onChange={(next) => {
        set({ weeklySessions: next });
      }}
    />
  );
}

function StepsSwitch({ deviceId, settings }: SettingsProps): ReactNode {
  const set = useGoalSetter(deviceId);
  return (
    <SwitchRow
      title="Steps goal"
      value={settings.goals.dailySteps !== null}
      onChange={(next) => {
        set({ dailySteps: next ? DEFAULT_STEPS : null });
      }}
    />
  );
}

function StepsRow({ deviceId, settings }: SettingsProps): ReactNode {
  const set = useGoalSetter(deviceId);
  return (
    <StepperRow
      title="Steps a day"
      value={settings.goals.dailySteps ?? DEFAULT_STEPS}
      range={STEPS}
      unit="steps"
      onChange={(next) => {
        set({ dailySteps: next });
      }}
    />
  );
}

function EnergySwitch({ deviceId, settings }: SettingsProps): ReactNode {
  const set = useGoalSetter(deviceId);
  return (
    <SwitchRow
      title="Energy goal"
      value={settings.goals.dailyKcal !== null}
      onChange={(next) => {
        set({ dailyKcal: next ? DEFAULT_KCAL : null });
      }}
    />
  );
}

function EnergyRow({ deviceId, settings }: SettingsProps): ReactNode {
  const set = useGoalSetter(deviceId);
  return (
    <StepperRow
      title="Energy a day"
      value={settings.goals.dailyKcal ?? DEFAULT_KCAL}
      range={KCAL}
      unit="kcal"
      onChange={(next) => {
        set({ dailyKcal: next });
      }}
    />
  );
}

export function GoalsList(props: SettingsProps): ReactNode {
  const { goals } = props.settings;
  return (
    <List
      inset
      title="Your goals"
      footer="The goal rings on the page count toward these. They are yours alone."
    >
      <MinutesRow {...props} />
      <DistanceRow {...props} />
      <SessionsRow {...props} />
      <StepsSwitch {...props} />
      {goals.dailySteps === null ? null : <StepsRow {...props} />}
      <EnergySwitch {...props} />
      {goals.dailyKcal === null ? null : <EnergyRow {...props} />}
    </List>
  );
}
