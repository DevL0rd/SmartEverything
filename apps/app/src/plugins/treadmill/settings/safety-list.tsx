import type { TreadmillPolicy } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useConfigure } from '../data/treadmill-act';
import {
  minimumSpeedLine,
  remoteSpeedRange,
  remoteStartConfirm,
  WHO_OPTIONS,
} from '../model/settings-model';
import { StepperRow } from './rows';
import type { SettingsProps } from './settings-props';
import { Anchored } from './anchored';

function RemoteStartRow({
  deviceId,
  policy,
}: {
  readonly deviceId: string;
  readonly policy: TreadmillPolicy;
}): ReactNode {
  const configure = useConfigure(deviceId);
  const turnOn = async (): Promise<void> => {
    if (await confirm(remoteStartConfirm(policy))) {
      configure({ policy: { remoteStart: true } });
    }
  };
  return (
    <Anchored deviceId={deviceId} id="remote-start" label="Allow remote start">
      <SwitchRow
        icon="lock"
        title="Allow remote start"
        subtitle="Start the belt from another phone, an automation or the assistant"
        value={policy.remoteStart}
        onChange={(next) => {
          if (next) {
            background(turnOn(), 'treadmill.confirm_failed');
          } else {
            configure({ policy: { remoteStart: false } });
          }
        }}
      />
    </Anchored>
  );
}

function RemoteWhoRow({
  deviceId,
  policy,
}: {
  readonly deviceId: string;
  readonly policy: TreadmillPolicy;
}): ReactNode {
  const configure = useConfigure(deviceId);
  return (
    <Anchored deviceId={deviceId} id="remote-who" label="Who can start it remotely">
      <SelectRow
        icon="users"
        title="Who can start it remotely"
        options={WHO_OPTIONS}
        value={policy.remoteWho}
        disabled={!policy.remoteStart}
        onChange={(next) => {
          configure({ policy: { remoteWho: next } });
        }}
      />
    </Anchored>
  );
}

function RemoteSpeedRow({
  deviceId,
  policy,
  limits,
}: {
  readonly deviceId: string;
  readonly policy: TreadmillPolicy;
  readonly limits: SettingsProps['state']['limits'];
}): ReactNode {
  const configure = useConfigure(deviceId);
  return (
    <Anchored deviceId={deviceId} id="remote-max" label="Remote speed limit">
      <StepperRow
        title="Remote speed limit"
        subtitle={`Remote speed-ups never go above this. ${minimumSpeedLine(limits.minKmh)}`}
        value={policy.remoteMaxKmh}
        range={remoteSpeedRange(limits)}
        unit="km/h"
        disabled={!policy.remoteStart}
        onChange={(next) => {
          configure({ policy: { remoteMaxKmh: next } });
        }}
      />
    </Anchored>
  );
}

function NoStepsRow({
  deviceId,
  policy,
}: {
  readonly deviceId: string;
  readonly policy: TreadmillPolicy;
}): ReactNode {
  const configure = useConfigure(deviceId);
  return (
    <Anchored deviceId={deviceId} id="no-steps" label="Stop when nobody steps on">
      <SwitchRow
        icon="footprints"
        title="Stop when nobody steps on"
        subtitle="After a remote start, stop the belt if no steps arrive within 30 seconds. Belts that report no step count are never stopped this way"
        value={policy.stopWithoutSteps}
        onChange={(next) => {
          configure({ policy: { stopWithoutSteps: next } });
        }}
      />
    </Anchored>
  );
}

export function SafetyList({ deviceId, state, settings }: SettingsProps): ReactNode {
  const current = settings.settings;
  if (current === null) {
    return null;
  }
  return (
    <List
      inset
      title="Safety"
      footer={
        state.limits.incline === null
          ? 'Stop and pause always work for everyone. Starting from this phone needs a one second hold.'
          : 'Stop and pause always work for everyone. Starting from this phone needs a one second hold. Remote incline is set under Incline and follows the same rule.'
      }
    >
      <RemoteStartRow deviceId={deviceId} policy={current.policy} />
      <RemoteWhoRow deviceId={deviceId} policy={current.policy} />
      <RemoteSpeedRow deviceId={deviceId} policy={current.policy} limits={state.limits} />
      <NoStepsRow deviceId={deviceId} policy={current.policy} />
    </List>
  );
}
