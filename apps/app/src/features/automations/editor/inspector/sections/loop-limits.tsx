import type { ReactNode } from 'react';
import { View } from 'react-native';
import { NumberStepper } from '../../../../../components/number-stepper';
import { SwitchRow } from '../../../../../components/rows';
import { List } from '../../../../../components/section';
import { Segmented } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import { CommittedField } from './committed-field';
import { DurationRow } from './duration-row';
import type { LimitChange, LoopLimitView } from './loop-model';
import {
  LIMIT_START_PASSES,
  LIMIT_START_TIME_MS,
  PASS_LIMIT_CAPTION,
  TIME_LIMIT_CAPTION,
  gapOps,
  isLimited,
  limitOps,
  loopLimitView,
  nextLimit,
} from './loop-model';
import { flowNodeOf } from './node-view';
import type { SectionProps } from './section-types';

const GAP_DEFAULT_MS = 1000;

function GapRows({
  limit,
  section,
}: {
  readonly limit: LoopLimitView;
  readonly section: SectionProps;
}): ReactNode {
  const { view, env, actions } = section;
  return (
    <>
      <SwitchRow
        title="Pause between passes"
        subtitle={limit.gapCaption}
        value={limit.gap !== undefined}
        disabled={env.locked}
        onChange={(on) => {
          actions.apply(gapOps(view.key, on ? GAP_DEFAULT_MS : null));
        }}
      />
      {limit.gap === undefined ? null : (
        <DurationRow
          label="Pause"
          value={limit.gap}
          fallback={GAP_DEFAULT_MS}
          disabled={env.locked}
          onChange={(gap) => {
            actions.apply(gapOps(view.key, gap));
          }}
        />
      )}
    </>
  );
}

function PassesRow({
  limit,
  change,
  disabled,
}: {
  readonly limit: LoopLimitView;
  readonly change: (next: LimitChange) => void;
  readonly disabled: boolean;
}): ReactNode {
  if (!limit.showsPasses) return null;
  return (
    <>
      <SwitchRow
        title="Pass limit"
        subtitle={PASS_LIMIT_CAPTION}
        value={limit.passes !== undefined}
        disabled={disabled}
        onChange={(on) => {
          change({ iterations: on ? LIMIT_START_PASSES : undefined });
        }}
      />
      {limit.passes === undefined ? null : (
        <View className="gap-1 px-4 py-2">
          <NumberStepper
            label="Most passes"
            value={limit.passes}
            min={1}
            max={Number.MAX_SAFE_INTEGER}
            step={100}
            disabled={disabled}
            onChange={(iterations) => {
              change({ iterations });
            }}
          />
        </View>
      )}
    </>
  );
}

function TimeRows({
  limit,
  change,
  disabled,
}: {
  readonly limit: LoopLimitView;
  readonly change: (next: LimitChange) => void;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <>
      <SwitchRow
        title="Time limit"
        subtitle={TIME_LIMIT_CAPTION}
        value={limit.time !== undefined}
        disabled={disabled}
        onChange={(on) => {
          change({ time: on ? LIMIT_START_TIME_MS : undefined });
        }}
      />
      {limit.time === undefined ? null : (
        <DurationRow
          label="Stop after"
          value={limit.time}
          fallback={LIMIT_START_TIME_MS}
          disabled={disabled}
          onChange={(time) => {
            change({ time });
          }}
        />
      )}
    </>
  );
}

function ReachedRows({
  limit,
  change,
  disabled,
}: {
  readonly limit: LoopLimitView;
  readonly change: (next: LimitChange) => void;
  readonly disabled: boolean;
}): ReactNode {
  if (!isLimited(limit)) return null;
  return (
    <View className="gap-2 px-4 py-2">
      <Text variant="footnote" tone="variant">
        When reached
      </Text>
      <Segmented
        label="When a limit is reached"
        options={[
          { value: 'fail', label: 'Fail the run' },
          { value: 'end', label: 'End quietly' },
        ]}
        value={limit.onLimit}
        disabled={disabled}
        onChange={(onLimit) => {
          change({ onLimit });
        }}
      />
      {limit.onLimit === 'end' ? (
        <CommittedField
          label="Note when it ends"
          value={limit.note ?? ''}
          disabled={disabled}
          onCommit={(note) => {
            change({ note });
          }}
        />
      ) : null}
    </View>
  );
}

export function LoopLimits(section: SectionProps): ReactNode {
  const node = flowNodeOf(section.view);
  if (node === undefined) return null;
  const limit = loopLimitView(node, node.kind);
  const { view, env, actions } = section;
  const change = (next: LimitChange): void => {
    actions.apply(limitOps(view.key, nextLimit(limit, next)));
  };
  return (
    <List title="Loop limits" footer="No limit unless you set one. Stop the run at any time.">
      <GapRows limit={limit} section={section} />
      <PassesRow limit={limit} change={change} disabled={env.locked} />
      <TimeRows limit={limit} change={change} disabled={env.locked} />
      <ReachedRows limit={limit} change={change} disabled={env.locked} />
    </List>
  );
}
