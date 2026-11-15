import type { PlannerSunrise } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FlatChoice } from '../../../components/flat-choice';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { SwitchRow } from '../../../components/rows';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useRows } from '../../../store/selectors';
import type { AlarmDraft, AlarmEdit } from './alarm-draft';
import {
  firstSunriseOf,
  missingLightsOf,
  sunriseGradientOf,
  sunriseStartOf,
  sunriseSummaryOf,
  toggledSunriseLight,
  type SunriseLight,
} from './sunrise-model';

export interface SunriseProps {
  readonly draft: AlarmDraft;
  readonly disabled: boolean;
  readonly onChange: (edit: AlarmEdit) => void;
}

const MOST = Number.MAX_SAFE_INTEGER;

function useHomeLights(): readonly SunriseLight[] {
  return useRows('devices')
    .filter((device) => device.kind === 'light')
    .map((device) => ({ id: device.id, name: device.label }));
}

function SunrisePreview({
  sunrise,
  time,
}: {
  readonly sunrise: PlannerSunrise;
  readonly time: string;
}): ReactNode {
  return (
    <View className="gap-1" accessibilityLabel={sunriseSummaryOf(sunrise, time)}>
      <View className={cn('h-6 rounded-full', sunriseGradientOf(sunrise.colour))} />
      <View className="flex-row justify-between">
        <Text variant="caption" tone="variant" className="tabular">
          {`${sunriseStartOf(sunrise, time)} lights on`}
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {`${time} full`}
        </Text>
      </View>
    </View>
  );
}

function LightChips({
  sunrise,
  lights,
  disabled,
  onChange,
}: {
  readonly sunrise: PlannerSunrise;
  readonly lights: readonly SunriseLight[];
  readonly disabled: boolean;
  readonly onChange: (edit: AlarmEdit) => void;
}): ReactNode {
  const missing = missingLightsOf(sunrise, lights).map((id) => ({ id, name: 'Removed light' }));
  return (
    <View className="flex-row flex-wrap gap-2">
      {[...lights, ...missing].map((light) => (
        <FlatChoice
          key={light.id}
          role="checkbox"
          spoken={`Sunrise on ${light.name}`}
          label={light.name}
          icon="lightbulb"
          active={sunrise.lights.includes(light.id)}
          disabled={disabled}
          onPress={() => {
            onChange({ sunrise: toggledSunriseLight(sunrise, light.id) });
          }}
        />
      ))}
    </View>
  );
}

function SunriseFields({
  sunrise,
  lights,
  draft,
  disabled,
  onChange,
}: SunriseProps & {
  readonly sunrise: PlannerSunrise;
  readonly lights: readonly SunriseLight[];
}): ReactNode {
  return (
    <View className="gap-3">
      <SunrisePreview sunrise={sunrise} time={draft.time} />
      <LightChips sunrise={sunrise} lights={lights} disabled={disabled} onChange={onChange} />
      <View>
        <ListRow
          title="Starts before"
          icon="clock"
          compact
          trailing={
            <NumberStepper
              label="Sunrise minutes"
              value={sunrise.minutes}
              min={1}
              max={MOST}
              step={5}
              unit="min"
              disabled={disabled}
              onChange={(minutes) => {
                onChange({ sunrise: { ...sunrise, minutes } });
              }}
            />
          }
        />
        <SwitchRow
          title="Warm to daylight"
          subtitle="Lights that can change colour cool as they brighten"
          wrapSubtitle
          icon="thermometer"
          compact
          value={sunrise.colour}
          disabled={disabled}
          onChange={(colour) => {
            onChange({ sunrise: { ...sunrise, colour } });
          }}
        />
      </View>
    </View>
  );
}

export function AlarmSunrise(props: SunriseProps): ReactNode {
  const { draft, disabled, onChange } = props;
  const lights = useHomeLights();
  const sunrise = draft.sunrise;
  const none = lights.length === 0 && sunrise === null;
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <View className="flex-row items-center gap-2">
        <Icon name="sunrise" size={18} tone="primary" />
        <Text variant="body-strong" className="flex-1">
          Sunrise
        </Text>
        <Switch
          label="Sunrise"
          value={sunrise !== null}
          disabled={disabled || none}
          onChange={(on) => {
            onChange({ sunrise: on ? firstSunriseOf(lights) : null });
          }}
        />
      </View>
      <Text variant="footnote" tone="variant">
        {none
          ? 'Add a light to the home to wake with a sunrise.'
          : sunrise === null
            ? 'Lights brighten slowly before the alarm rings.'
            : sunriseSummaryOf(sunrise, draft.time)}
      </Text>
      {sunrise === null ? null : <SunriseFields {...props} sunrise={sunrise} lights={lights} />}
    </View>
  );
}
