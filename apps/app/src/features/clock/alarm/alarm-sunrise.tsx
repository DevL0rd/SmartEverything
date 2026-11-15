import type { PlannerSunrise } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useRows } from '../../../store/selectors';
import type { AlarmDraft, AlarmEdit } from './alarm-draft';
import { minutesText } from './alarm-options';
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
  readonly compact: boolean;
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

function LightRows({
  sunrise,
  lights,
  compact,
  disabled,
  onChange,
}: {
  readonly sunrise: PlannerSunrise;
  readonly lights: readonly SunriseLight[];
  readonly compact: boolean;
  readonly disabled: boolean;
  readonly onChange: (edit: AlarmEdit) => void;
}): ReactNode {
  const missing = missingLightsOf(sunrise, lights).map((id) => ({ id, name: 'Removed light' }));
  return (
    <>
      {[...lights, ...missing].map((light) => (
        <SwitchRow
          key={light.id}
          title={light.name}
          label={`Sunrise on ${light.name}`}
          icon="lightbulb"
          compact={compact}
          value={sunrise.lights.includes(light.id)}
          disabled={disabled}
          onChange={() => {
            onChange({ sunrise: toggledSunriseLight(sunrise, light.id) });
          }}
        />
      ))}
    </>
  );
}

function StartsBefore({
  sunrise,
  compact,
  disabled,
  onChange,
}: Omit<SunriseProps, 'draft'> & { readonly sunrise: PlannerSunrise }): ReactNode {
  return (
    <ListRow
      title="Starts before"
      icon="clock"
      compact={compact}
      disabled={disabled}
      trailing={
        <NumberStepper
          label="Sunrise minutes"
          value={sunrise.minutes}
          min={1}
          max={MOST}
          step={5}
          formatValue={minutesText}
          disabled={disabled}
          onChange={(minutes) => {
            onChange({ sunrise: { ...sunrise, minutes } });
          }}
        />
      }
    />
  );
}

function SunriseFields({
  sunrise,
  lights,
  draft,
  compact,
  disabled,
  onChange,
}: SunriseProps & {
  readonly sunrise: PlannerSunrise;
  readonly lights: readonly SunriseLight[];
}): ReactNode {
  return (
    <>
      <View className={compact ? 'py-2' : 'px-4 py-2'}>
        <SunrisePreview sunrise={sunrise} time={draft.time} />
      </View>
      <LightRows
        sunrise={sunrise}
        lights={lights}
        compact={compact}
        disabled={disabled}
        onChange={onChange}
      />
      <StartsBefore sunrise={sunrise} compact={compact} disabled={disabled} onChange={onChange} />
      <SwitchRow
        title="Warm to daylight"
        subtitle="Lights that can change colour cool as they brighten"
        wrapSubtitle
        icon="thermometer"
        compact={compact}
        value={sunrise.colour}
        disabled={disabled}
        onChange={(colour) => {
          onChange({ sunrise: { ...sunrise, colour } });
        }}
      />
    </>
  );
}

function sunriseHintOf(none: boolean, sunrise: PlannerSunrise | null, time: string): string {
  if (none) return 'Add a light to the home to wake with a sunrise';
  return sunrise === null
    ? 'Lights brighten slowly before the alarm rings'
    : sunriseSummaryOf(sunrise, time);
}

export function AlarmSunrise(props: SunriseProps): ReactNode {
  const { draft, compact, disabled, onChange } = props;
  const lights = useHomeLights();
  const sunrise = draft.sunrise;
  const none = lights.length === 0 && sunrise === null;
  return (
    <View>
      <SwitchRow
        title="Sunrise"
        subtitle={sunriseHintOf(none, sunrise, draft.time)}
        wrapSubtitle
        icon="sunrise"
        compact={compact}
        value={sunrise !== null}
        disabled={disabled || none}
        onChange={(on) => {
          onChange({ sunrise: on ? firstSunriseOf(lights) : null });
        }}
      />
      {sunrise === null ? null : <SunriseFields {...props} sunrise={sunrise} lights={lights} />}
    </View>
  );
}
