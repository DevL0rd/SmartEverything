import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TriggerNode } from '@smarteverything/domain';
import { NumberStepper } from '../../../../components/number-stepper';
import { SelectRow, SwitchRow } from '../../../../components/rows';
import { List, Section } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { DurationRow } from '../inspector/sections/duration-row';
import type { HeaderEnv, HeaderSectionProps } from './header-types';
import type { TimingName, TimingValues, WindowSetting } from './timing-model';
import {
  DEFAULT_MS,
  TIMING_TEXT,
  WINDOW_MODES,
  defaultTiming,
  timingNamesOf,
  timingOps,
  timingValuesOf,
} from './timing-model';
import { TimingStrip } from './timing-strip';

interface OptionProps {
  readonly env: HeaderEnv;
  readonly trigger: TriggerNode;
  readonly name: TimingName;
  readonly values: TimingValues;
}

function windowRows({ env, trigger }: OptionProps, setting: WindowSetting): ReactNode[] {
  const change = (next: WindowSetting): void => {
    env.apply(timingOps(trigger.key, 'window', { lit: { of: next.of, seconds: next.seconds } }));
  };
  return [
    <SelectRow
      key="window-mode"
      title="Measure"
      value={setting.of}
      disabled={env.locked}
      options={WINDOW_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
      onChange={(of) => {
        change({ ...setting, of });
      }}
    />,
    <View key="window-seconds" className="px-4 py-2">
      <NumberStepper
        label="Over the last seconds"
        value={setting.seconds}
        min={1}
        max={86_400}
        step={10}
        unit="s"
        disabled={env.locked}
        onChange={(seconds) => {
          change({ ...setting, seconds });
        }}
      />
    </View>,
  ];
}

function rearmRow({ env, trigger }: OptionProps, value: number): ReactNode {
  return (
    <View key="rearm-value" className="px-4 py-2">
      <NumberStepper
        label="Fire again once the value is back past"
        value={value}
        min={-1_000_000}
        max={1_000_000}
        step={1}
        disabled={env.locked}
        onChange={(next) => {
          env.apply(timingOps(trigger.key, 'rearm', { lit: next }));
        }}
      />
    </View>
  );
}

function editorRows(props: OptionProps): ReactNode[] {
  const { env, trigger, name, values } = props;
  if (name === 'window') return values.window === undefined ? [] : windowRows(props, values.window);
  if (name === 'rearm') return values.rearm === undefined ? [] : [rearmRow(props, values.rearm)];
  const current = values[name];
  if (current === undefined) return [];
  return [
    <DurationRow
      key={`${name}-duration`}
      label={TIMING_TEXT[name].title}
      value={current}
      fallback={DEFAULT_MS[name]}
      disabled={env.locked}
      onChange={(ms) => {
        env.apply(timingOps(trigger.key, name, { lit: ms }));
      }}
    />,
  ];
}

function optionRows(props: OptionProps): ReactNode[] {
  const { env, trigger, name, values } = props;
  const text = TIMING_TEXT[name];
  return [
    <SwitchRow
      key={name}
      title={text.title}
      subtitle={text.explain}
      wrapSubtitle
      value={values[name] !== undefined}
      disabled={env.locked}
      onChange={(on) => {
        env.apply(timingOps(trigger.key, name, on ? defaultTiming(name) : null));
      }}
    />,
    ...editorRows(props),
  ];
}

function TriggerCard({
  env,
  trigger,
}: {
  readonly env: HeaderEnv;
  readonly trigger: TriggerNode;
}): ReactNode {
  const kind = env.registry.get(trigger.kind);
  const names = timingNamesOf(kind);
  const values = timingValuesOf(trigger);
  const title = trigger.label ?? kind?.name ?? trigger.kind;
  return (
    <List title={title}>
      {names.length === 0 ? (
        <View key="none" className="px-4 py-3">
          <Text variant="footnote" tone="variant">
            This trigger has no timing options. It fires as soon as it matches.
          </Text>
        </View>
      ) : (
        <TimingStrip key="strip" values={values} />
      )}
      {names.flatMap((name) => optionRows({ env, trigger, name, values }))}
    </List>
  );
}

export function TriggersSection({ env }: HeaderSectionProps): ReactNode {
  const { triggers } = env.program;
  if (triggers.length === 0) {
    return (
      <Section title="Triggers">
        <Text variant="footnote" tone="variant" className="px-4">
          Nothing starts this automation yet. Run it by hand or add a trigger.
        </Text>
      </Section>
    );
  }
  return (
    <View className="gap-4">
      {triggers.map((trigger) => (
        <TriggerCard key={trigger.id} env={env} trigger={trigger} />
      ))}
    </View>
  );
}
