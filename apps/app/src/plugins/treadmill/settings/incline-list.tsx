import type { InclineScale, TreadmillPolicy } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { confirm } from '../../../components/confirm-store';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useConfigure } from '../data/treadmill-act';
import { unitWord } from '../model/incline-model';
import {
  INCLINE_CALIBRATION_NOTE,
  INCLINE_SCALE_OPTIONS,
  INCLINE_SCALE_SUBTITLE,
  remoteInclineConfirm,
} from '../model/settings-model';
import { Anchored } from './anchored';
import { StepperRow } from './rows';
import type { SettingsProps } from './settings-props';

function RemoteInclineRow({
  deviceId,
  policy,
  scale,
}: {
  readonly deviceId: string;
  readonly policy: TreadmillPolicy;
  readonly scale: InclineScale;
}): ReactNode {
  const configure = useConfigure(deviceId);
  const turnOn = async (): Promise<void> => {
    if (await confirm(remoteInclineConfirm(policy.remoteInclineMax, scale))) {
      configure({ policy: { remoteIncline: true } });
    }
  };
  return (
    <Anchored deviceId={deviceId} id="remote-incline" label="Allow remote incline">
      <SwitchRow
        icon="lock"
        title="Allow remote incline"
        subtitle="Raise the incline from another phone, an automation or the assistant. Stop always works"
        value={policy.remoteIncline}
        onChange={(next) => {
          if (next) {
            background(turnOn(), 'treadmill.confirm_failed');
          } else {
            configure({ policy: { remoteIncline: false } });
          }
        }}
      />
    </Anchored>
  );
}

function RemoteCapRow({
  deviceId,
  policy,
  range,
  scale,
}: {
  readonly deviceId: string;
  readonly policy: TreadmillPolicy;
  readonly range: { readonly min: number; readonly max: number; readonly step: number };
  readonly scale: InclineScale;
}): ReactNode {
  const configure = useConfigure(deviceId);
  return (
    <Anchored deviceId={deviceId} id="remote-incline-cap" label="Remote incline limit">
      <StepperRow
        title="Remote incline limit"
        subtitle="Remote raises never go above this"
        value={policy.remoteInclineMax}
        range={range}
        unit={unitWord(scale)}
        disabled={!policy.remoteIncline}
        onChange={(next) => {
          configure({ policy: { remoteInclineMax: next } });
        }}
      />
    </Anchored>
  );
}

export function InclineList({ deviceId, state, settings }: SettingsProps): ReactNode {
  const configure = useConfigure(deviceId);
  const current = settings.settings;
  const range = state.limits.incline;
  if (current === null || range === null) {
    return null;
  }
  const scale = current.inclineScale;
  return (
    <List inset title="Incline" footer={INCLINE_CALIBRATION_NOTE}>
      <Anchored deviceId={deviceId} id="incline-scale" label="Incline scale">
        <SelectRow
          icon="trendUp"
          title="Incline scale"
          subtitle={INCLINE_SCALE_SUBTITLE}
          wrapSubtitle
          options={INCLINE_SCALE_OPTIONS}
          value={scale}
          onChange={(next) => {
            configure({ inclineScale: next });
          }}
        />
      </Anchored>
      <RemoteInclineRow deviceId={deviceId} policy={current.policy} scale={scale} />
      <RemoteCapRow deviceId={deviceId} policy={current.policy} range={range} scale={scale} />
    </List>
  );
}
