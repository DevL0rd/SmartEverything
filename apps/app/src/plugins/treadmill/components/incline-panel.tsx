import type { InclineScale, TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useLiveSelect } from '../data/treadmill-data';
import {
  chipLabel,
  climbLine,
  deckAngleLine,
  inclineChips,
  inclineGateOf,
  movingLine,
  steppedIncline,
  type InclineGate,
  type InclineRange,
} from '../model/incline-model';
import { InclineGauge } from './incline-gauge';
import { useInclineWalk, type InclineWalk } from './incline-walk';
import {
  ChipRow,
  PanelFrame,
  PanelTop,
  ReasonLine,
  StepButton,
  StepRow,
  type ChipProps,
  type StepButtonProps,
} from './panel-parts';

const GAUGE_WIDTH = 148;

const REASON_HINT = 'The reason is shown under the buttons.';

interface Props {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}

type ControlsGate = Extract<InclineGate, { readonly kind: 'controls' }>;

function useReadout(
  deviceId: string,
  view: TreadmillStateView,
): {
  readonly value: number;
  readonly target: number | null;
  readonly grade: number | null;
  readonly climb: number | null;
} {
  const { frame } = view;
  const incline = useLiveSelect(deviceId, frame, (live) => live.belt.inclinePercent);
  const target = useLiveSelect(deviceId, frame, (live) => live.belt.inclineTarget);
  const grade = useLiveSelect(deviceId, frame, (live) => live.belt.inclineGrade);
  const climb = useLiveSelect(deviceId, frame, (live) => live.session?.climbM ?? null);
  return { value: incline ?? view.limits.incline?.min ?? 0, target, grade, climb };
}

function ReadLines({
  value,
  target,
  grade,
  climb,
  progress,
}: {
  readonly value: number;
  readonly target: number | null;
  readonly grade: number | null;
  readonly climb: number | null;
  readonly progress: string | null;
}): ReactNode {
  const lines = [progress ?? movingLine(value, target), deckAngleLine(grade), climbLine(climb)];
  return (
    <View className="gap-0.5">
      {lines.map((line) =>
        line === null ? null : (
          <Text key={line} variant="callout" tone="variant" accessibilityLiveRegion="polite">
            {line}
          </Text>
        ),
      )}
    </View>
  );
}

type StepHandlers = Pick<StepButtonProps, 'onPress' | 'onLongPress' | 'onPressOut'>;

function handlersOf(walk: InclineWalk, gate: ControlsGate, direction: 1 | -1): StepHandlers {
  return {
    onPress: (): void => {
      if (!gate.hold) {
        walk.stepOnce(direction);
      }
    },
    onLongPress: (): void => {
      if (gate.hold) {
        walk.stepOnce(direction);
      } else {
        walk.repeat(direction);
      }
    },
    onPressOut: walk.release,
  };
}

function chipsOf(walk: InclineWalk, gate: ControlsGate, value: number): ChipProps[] {
  const off = !gate.enabled || gate.hold;
  return inclineChips(gate).map((chip) => ({
    label: chipLabel(chip),
    spoken: chip === 0 ? 'Incline flat' : `Incline ${String(chip)}`,
    selected: chip === value,
    disabled: off,
    hint: off ? REASON_HINT : 'Walks the incline there one step at a time',
    onPress: (): void => {
      walk.walkTo(chip);
    },
  }));
}

function stepHintOf(gate: ControlsGate): string {
  if (!gate.enabled) {
    return REASON_HINT;
  }
  return gate.hold ? 'Hold for a second' : 'Hold to keep going';
}

function Controls({
  walk,
  gate,
  value,
}: {
  readonly walk: InclineWalk;
  readonly gate: ControlsGate;
  readonly value: number;
}): ReactNode {
  const hint = stepHintOf(gate);
  return (
    <>
      <StepRow>
        <StepButton
          icon="minus"
          label="Lower the incline by one step"
          hint={hint}
          disabled={!gate.enabled || steppedIncline(value, -1, gate) === null}
          {...handlersOf(walk, gate, -1)}
        />
        <StepButton
          icon="plus"
          label="Raise the incline by one step"
          hint={hint}
          disabled={!gate.enabled || steppedIncline(value, 1, gate) === null}
          {...handlersOf(walk, gate, 1)}
        />
      </StepRow>
      <ChipRow chips={chipsOf(walk, gate, value)} />
      <ReasonLine reason={gate.reason} />
    </>
  );
}

interface Shown {
  readonly range: InclineRange;
  readonly value: number;
  readonly target: number | null;
  readonly grade: number | null;
  readonly climb: number | null;
  readonly scale: InclineScale;
}

function useShown(deviceId: string, view: TreadmillStateView, range: InclineRange): Shown {
  const readout = useReadout(deviceId, view);
  const scale = useLiveSelect(deviceId, view.frame, (live) => live.belt.inclineScale);
  return { ...readout, range, scale };
}

function Readout({
  shown,
  cap,
  progress,
  children,
}: {
  readonly shown: Shown;
  readonly cap: number | null;
  readonly progress: string | null;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <PanelFrame title="Incline">
      <PanelTop
        gauge={
          <InclineGauge
            value={shown.value}
            target={shown.target}
            cap={cap}
            scale={shown.scale}
            range={shown.range}
            width={GAUGE_WIDTH}
          />
        }
      >
        <ReadLines
          value={shown.value}
          target={shown.target}
          grade={shown.grade}
          climb={shown.climb}
          progress={progress}
        />
      </PanelTop>
      {children}
    </PanelFrame>
  );
}

function ControlsBody({
  deviceId,
  view,
  gate,
  range,
}: Props & { readonly gate: ControlsGate; readonly range: InclineRange }): ReactNode {
  const shown = useShown(deviceId, view, range);
  const walk = useInclineWalk(deviceId, view, gate);
  const cap = gate.ceiling < range.max ? gate.ceiling : null;
  return (
    <Readout shown={shown} cap={cap} progress={walk.progress}>
      <Controls walk={walk} gate={gate} value={shown.value} />
    </Readout>
  );
}

function ViewerBody({
  deviceId,
  view,
  gate,
  range,
}: Props & {
  readonly gate: Extract<InclineGate, { readonly kind: 'viewer' }>;
  readonly range: InclineRange;
}): ReactNode {
  const shown = useShown(deviceId, view, range);
  return (
    <Readout shown={shown} cap={null} progress={null}>
      <ReasonLine reason={gate.reason} />
    </Readout>
  );
}

export function InclinePanel({ deviceId, view }: Props): ReactNode {
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  const gate = inclineGateOf(view, state);
  const range = view.limits.incline;
  if (gate.kind === 'none' || range === null) {
    return null;
  }
  return gate.kind === 'controls' ? (
    <ControlsBody deviceId={deviceId} view={view} gate={gate} range={range} />
  ) : (
    <ViewerBody deviceId={deviceId} view={view} gate={gate} range={range} />
  );
}
