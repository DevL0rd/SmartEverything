import {
  BRUSH_INTENSITIES,
  SONICARE_MODES,
  SONICARE_MODE_LABELS,
  type BrushIntensity,
  type SonicareMode,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useControl } from '../../../store/control';
import { useConfigure } from '../../toothbrush/data/brush-act';
import { INTENSITY_LABEL } from '../../toothbrush/model/brush-model';
import { Anchored } from '../../toothbrush/settings/anchored';
import type { SettingsProps } from '../../toothbrush/settings/settings-props';

const INTENSITY_OPTIONS = BRUSH_INTENSITIES.map((value) => ({
  value,
  label: INTENSITY_LABEL[value],
}));

function Toggle({
  deviceId,
  capability,
  id,
  title,
  subtitle,
}: {
  readonly deviceId: string;
  readonly capability: string;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}): ReactNode {
  const control = useControl(deviceId, capability);
  return (
    <Anchored deviceId={deviceId} id={id} label={title}>
      <SwitchRow
        title={title}
        subtitle={subtitle}
        wrapSubtitle
        value={control.value === true}
        onChange={(next) => {
          background(control.set(next), 'control.set_failed');
        }}
      />
    </Anchored>
  );
}

function Feedback({ deviceId }: { readonly deviceId: string }): ReactNode {
  return (
    <>
      <Toggle
        deviceId={deviceId}
        capability="brush_feedback_pressure"
        id="handle-pressure"
        title="Pressure feedback"
        subtitle="The handle vibrates when you press too hard"
      />
      <Toggle
        deviceId={deviceId}
        capability="brush_feedback_scrubbing"
        id="handle-scrubbing"
        title="Scrubbing feedback"
        subtitle="The ring light shows when you scrub"
      />
      <Toggle
        deviceId={deviceId}
        capability="brush_adaptive_intensity"
        id="handle-adaptive"
        title="Adaptive intensity"
        subtitle="The handle eases off when you press hard"
      />
    </>
  );
}

function Defaults({ deviceId, state, settings }: SettingsProps): ReactNode {
  const configure = useConfigure(deviceId);
  const value = settings.settings;
  if (value === null) {
    return null;
  }
  return (
    <>
      <Anchored deviceId={deviceId} id="handle-mode" label="Mode when the brush wakes">
        <SelectRow<SonicareMode>
          icon="settings"
          title="Mode when the brush wakes"
          options={SONICARE_MODES.filter((mode) => state.availableModes.includes(mode)).map(
            (mode) => ({ value: mode, label: SONICARE_MODE_LABELS[mode] }),
          )}
          value={value.defaultMode}
          placeholder="Leave as it is"
          onChange={(next) => {
            configure({ defaultMode: next });
          }}
        />
      </Anchored>
      <Anchored deviceId={deviceId} id="handle-intensity" label="Intensity when the brush wakes">
        <SelectRow<BrushIntensity>
          icon="settings"
          title="Intensity when the brush wakes"
          options={INTENSITY_OPTIONS}
          value={value.defaultIntensity}
          placeholder="Leave as it is"
          onChange={(next) => {
            configure({ defaultIntensity: next });
          }}
        />
      </Anchored>
    </>
  );
}

function Written(props: SettingsProps): ReactNode {
  return (
    <>
      {props.state.profile.brand === 'sonicare' && props.state.profile.settingsWrite ? (
        <Feedback deviceId={props.deviceId} />
      ) : null}
      <Defaults {...props} />
    </>
  );
}

export function HandleList(props: SettingsProps): ReactNode {
  const { deviceId, state, settings } = props;
  const configure = useConfigure(deviceId);
  const value = settings.settings;
  const { profile } = state;
  if (
    value === null ||
    profile.brand !== 'sonicare' ||
    !(profile.writes || profile.settingsWrite)
  ) {
    return null;
  }
  return (
    <List
      inset
      title="Handle settings"
      footer="Changes are written to the handle the next time it is awake and not brushing."
    >
      <Anchored
        deviceId={deviceId}
        id="handle-consent"
        label="Let SmartEverything change brush settings"
      >
        <SwitchRow
          icon="shield"
          title="Let SmartEverything change brush settings"
          subtitle="Allows the mode, intensity and feedback of this brush to be changed from the app and by automations"
          wrapSubtitle
          value={value.consent}
          onChange={(next) => {
            configure({ consent: next });
          }}
        />
      </Anchored>
      {value.consent ? <Written {...props} /> : null}
    </List>
  );
}
