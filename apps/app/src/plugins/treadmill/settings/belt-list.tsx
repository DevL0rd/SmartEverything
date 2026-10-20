import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { GoalSheet } from '../components/goal-sheet';
import {
  lightStripSubtitle,
  minimumSpeedLine,
  padLayoutOf,
  SENSITIVITY_OPTIONS,
  supplementFacts,
} from '../model/settings-model';
import { Anchored } from './anchored';
import { PadSelectRow, PadStepperRow, PadSwitchRow } from './rows';
import type { SettingsProps } from './settings-props';

type Pad = TreadmillStateView['pad'];

interface Ctx {
  readonly deviceId: string;
  readonly pad: Pad;
  readonly state: TreadmillStateView;
  readonly openGoal: () => void;
}

function goalWords(pad: Pad): string {
  return pad.goalKind === undefined || pad.goalKind === 'none' ? 'None' : pad.goalKind;
}

function maxSpeedRow({ deviceId, pad, state }: Ctx): ReactNode {
  return (
    <Anchored key="max" deviceId={deviceId} id="max-speed" label="Maximum speed">
      <PadStepperRow
        deviceId={deviceId}
        capability="belt_max_speed"
        title="Maximum speed"
        subtitle={`The belt never goes faster than this. ${minimumSpeedLine(state.limits.minKmh)}`}
        value={pad.maxSpeedKmh ?? state.limits.maxKmh}
        range={{
          min: state.limits.minKmh,
          max: state.limits.maxKmh,
          step: state.limits.stepKmh,
        }}
        unit="km/h"
      />
    </Anchored>
  );
}

function fullRows(ctx: Ctx): readonly ReactNode[] {
  const { deviceId, pad, state } = ctx;
  return [
    maxSpeedRow(ctx),
    <Anchored key="start" deviceId={deviceId} id="start-speed" label="Start speed">
      <PadStepperRow
        deviceId={deviceId}
        capability="belt_start_speed"
        title="Start speed"
        subtitle="The speed the belt begins at"
        value={pad.startSpeedKmh ?? state.limits.minKmh}
        range={{
          min: state.limits.minKmh,
          max: state.limits.maxKmh,
          step: state.limits.stepKmh,
        }}
        unit="km/h"
      />
    </Anchored>,
    <Anchored key="auto" deviceId={deviceId} id="auto-start" label="Auto start">
      <PadSwitchRow
        deviceId={deviceId}
        capability="belt_auto_start"
        title="Auto start"
        subtitle="The belt starts when you step on"
        value={pad.autoStart === true}
      />
    </Anchored>,
    <Anchored key="sens" deviceId={deviceId} id="sensitivity" label="Step-on sensitivity">
      <PadSelectRow
        deviceId={deviceId}
        capability="belt_sensitivity"
        title="Step-on sensitivity"
        options={SENSITIVITY_OPTIONS}
        value={pad.sensitivity ?? null}
      />
    </Anchored>,
    <Anchored key="goal" deviceId={deviceId} id="pad-goal" label="Session goal">
      <ActionRow
        icon="trophy"
        title="Session goal"
        subtitle={goalWords(pad)}
        onPress={ctx.openGoal}
      />
    </Anchored>,
  ];
}

function supplementRows(ctx: Ctx): readonly ReactNode[] {
  const { deviceId, pad } = ctx;
  return [
    maxSpeedRow(ctx),
    <Anchored key="sounds" deviceId={deviceId} id="button-sounds" label="Button sounds">
      <PadSwitchRow
        deviceId={deviceId}
        capability="buzzer"
        title="Button sounds"
        value={pad.buzzer === true}
      />
    </Anchored>,
    <Anchored key="light" deviceId={deviceId} id="light-strip" label="Light strip">
      <PadSwitchRow
        deviceId={deviceId}
        capability="belt_light"
        title="Light strip"
        subtitle={lightStripSubtitle(pad.light)}
        value={pad.light === true}
      />
    </Anchored>,
    ...supplementFacts(pad).map((fact) => (
      <ValueRow key={fact.label} title={fact.label} value={fact.value} />
    )),
  ];
}

function rowsFor(layout: ReturnType<typeof padLayoutOf>, ctx: Ctx): readonly ReactNode[] {
  if (layout === 'full') {
    return fullRows(ctx);
  }
  return layout === 'supplement' ? supplementRows(ctx) : [];
}

export function BeltList({ deviceId, state, settings }: SettingsProps): ReactNode {
  const [goalOpen, setGoalOpen] = useState(false);
  const layout = padLayoutOf(state.family);
  const pad = settings.pad ?? state.pad;
  const ctx: Ctx = {
    deviceId,
    pad,
    state,
    openGoal: () => {
      setGoalOpen(true);
    },
  };
  return (
    <>
      <List
        inset
        title="On the belt"
        footer={
          layout === 'none'
            ? 'This treadmill has no settings that can be changed from the app.'
            : 'These are stored in the belt itself. Panel-only options stay on the panel.'
        }
      >
        {layout === 'none' ? null : (
          <Anchored deviceId={deviceId} id="child-lock" label="Child lock">
            <PadSwitchRow
              deviceId={deviceId}
              capability="child_lock"
              title="Child lock"
              subtitle="Locks the panel and the app controls"
              value={pad.childLock === true}
            />
          </Anchored>
        )}
        {rowsFor(layout, ctx)}
      </List>
      <GoalSheet
        key={pad.goalKind ?? 'none'}
        deviceId={deviceId}
        view={state}
        open={goalOpen}
        onClose={() => {
          setGoalOpen(false);
        }}
      />
    </>
  );
}
