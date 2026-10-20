import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../../components/banner';
import { NumberStepper } from '../../../../components/number-stepper';
import { SelectRow, SwitchRow } from '../../../../components/rows';
import { List } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { DurationRow } from '../inspector/sections/duration-row';
import type { HeaderEnv, HeaderSectionProps } from './header-types';
import {
  BUTTON_HINT,
  DEFAULT_MAX,
  MAX_WAIT_DEFAULT_MS,
  MODE_CHOICES,
  RUN_TIMEOUT_DEFAULT_MS,
  allowsMax,
  explainMode,
  maxSummary,
  needsButtonHint,
  policyOp,
  withMax,
  withMaxWait,
  withMode,
  withRunTimeout,
} from './policy-model';

const MOST_RUNS = 1000;

function maxRows(env: HeaderEnv): ReactNode[] {
  const { policy } = env.program;
  const rows: ReactNode[] = [
    <SwitchRow
      key="limit"
      title="Limit how many"
      subtitle={maxSummary(policy)}
      value={policy.max !== undefined}
      disabled={env.locked}
      onChange={(on) => {
        env.apply([policyOp(withMax(policy, on ? DEFAULT_MAX : null))]);
      }}
    />,
  ];
  if (policy.max !== undefined) {
    rows.push(
      <View key="max" className="px-4 py-2">
        <NumberStepper
          label="Most runs"
          value={policy.max}
          min={1}
          max={MOST_RUNS}
          step={1}
          disabled={env.locked}
          onChange={(max) => {
            env.apply([policyOp(withMax(policy, max))]);
          }}
        />
      </View>,
    );
  }
  return rows;
}

function waitRows(env: HeaderEnv): ReactNode[] {
  const { policy } = env.program;
  const rows: ReactNode[] = [
    <SwitchRow
      key="wait"
      title="Give up waiting"
      subtitle="A start that waits longer than this is dropped."
      wrapSubtitle
      value={policy.maxWait !== undefined}
      disabled={env.locked}
      onChange={(on) => {
        env.apply([policyOp(withMaxWait(policy, on ? MAX_WAIT_DEFAULT_MS : null))]);
      }}
    />,
  ];
  if (policy.maxWait !== undefined) {
    rows.push(
      <DurationRow
        key="waitFor"
        label="Wait at most"
        value={policy.maxWait}
        fallback={MAX_WAIT_DEFAULT_MS}
        disabled={env.locked}
        onChange={(ms) => {
          env.apply([policyOp(withMaxWait(policy, ms))]);
        }}
      />,
    );
  }
  return rows;
}

function queueRows(env: HeaderEnv): ReactNode[] {
  if (!allowsMax(env.program.policy.mode)) return [];
  return [...maxRows(env), ...waitRows(env)];
}

function timeLimitRows(env: HeaderEnv): ReactNode[] {
  const { policy } = env.program;
  const rows: ReactNode[] = [
    <SwitchRow
      key="timeout"
      title="Time limit for a run"
      subtitle="A run that takes longer is stopped."
      value={policy.timeout !== undefined}
      disabled={env.locked}
      onChange={(on) => {
        env.apply([policyOp(withRunTimeout(policy, on ? RUN_TIMEOUT_DEFAULT_MS : null))]);
      }}
    />,
  ];
  if (policy.timeout !== undefined) {
    rows.push(
      <DurationRow
        key="timeoutFor"
        label="Stop after"
        value={policy.timeout}
        fallback={RUN_TIMEOUT_DEFAULT_MS}
        disabled={env.locked}
        onChange={(ms) => {
          env.apply([policyOp(withRunTimeout(policy, ms))]);
        }}
      />,
    );
  }
  return rows;
}

export function PolicySection({ env }: HeaderSectionProps): ReactNode {
  const { policy } = env.program;
  return (
    <View className="gap-3">
      <List title="Run behaviour" footer={explainMode(policy.mode)}>
        <SelectRow
          key="mode"
          title="When it starts again"
          value={policy.mode}
          disabled={env.locked}
          options={MODE_CHOICES.map((choice) => ({
            value: choice.value,
            label: choice.label,
            description: choice.explain,
            wrapDescription: true,
          }))}
          onChange={(mode) => {
            env.apply([policyOp(withMode(policy, mode))]);
          }}
        />
        {queueRows(env)}
        {timeLimitRows(env)}
      </List>
      {needsButtonHint(env.program) ? (
        <View className="px-4">
          <Banner
            tone="info"
            title={BUTTON_HINT}
            action={{
              label: 'Use Queue',
              onPress: () => {
                env.apply([policyOp(withMode(policy, 'queue'))]);
              },
            }}
          />
        </View>
      ) : null}
      {policy.mode === 'single' ? null : (
        <Text variant="footnote" tone="variant" className="px-4">
          {policy.mode === 'restart'
            ? 'The stopped run ends as stopped. Steps already sent are not undone.'
            : 'Runs share variables that are kept between runs.'}
        </Text>
      )}
    </View>
  );
}
