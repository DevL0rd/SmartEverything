import type { BrushSensors, SonicareProfile } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { IconName } from '../../../components/icon';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useConfigure } from '../../toothbrush/data/brush-act';
import { Anchored } from '../../toothbrush/settings/anchored';
import type { SettingsProps } from '../../toothbrush/settings/settings-props';

function SensorRow({
  deviceId,
  id,
  icon,
  title,
  subtitle,
  value,
  field,
}: {
  readonly deviceId: string;
  readonly id: string;
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle?: string;
  readonly value: boolean;
  readonly field: keyof BrushSensors;
}): ReactNode {
  const configure = useConfigure(deviceId);
  return (
    <Anchored deviceId={deviceId} id={id} label={title}>
      <SwitchRow
        icon={icon}
        title={title}
        {...(subtitle === undefined ? {} : { subtitle })}
        value={value}
        onChange={(next) => {
          configure({ sensors: { [field]: next } });
        }}
      />
    </Anchored>
  );
}

function readsSensors(profile: SonicareProfile): boolean {
  return profile.pressure !== 'none' || profile.temperature || profile.motion;
}

export function SensorsList({ deviceId, state, settings }: SettingsProps): ReactNode {
  const value = settings.settings;
  const { profile } = state;
  if (value === null || profile.brand !== 'sonicare' || !readsSensors(profile)) {
    return null;
  }
  const { sensors } = value;
  return (
    <List
      inset
      title="Sensors"
      footer="Sensors are read only while you brush. Turning one off saves a little battery on the brush."
    >
      {profile.pressure === 'none' ? null : (
        <SensorRow
          deviceId={deviceId}
          id="sensor-pressure"
          icon="gauge"
          title="Read the pressure sensor"
          subtitle="Shows when you press too hard"
          value={sensors.pressure}
          field="pressure"
        />
      )}
      {profile.temperature ? (
        <SensorRow
          deviceId={deviceId}
          id="sensor-temperature"
          icon="thermometer"
          title="Read the handle temperature"
          value={sensors.temperature}
          field="temperature"
        />
      ) : null}
      {profile.motion ? (
        <SensorRow
          deviceId={deviceId}
          id="sensor-motion"
          icon="move"
          title="Read the motion sensor"
          subtitle="Recorded for later; not shown yet"
          value={sensors.motion}
          field="motion"
        />
      ) : null}
    </List>
  );
}
