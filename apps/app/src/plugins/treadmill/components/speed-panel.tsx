import type { TreadmillStateView } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { useControl } from '../../../store/control';
import { useLiveSelect } from '../data/treadmill-data';
import {
  controlsOf,
  movingZone,
  paceText,
  speedCeiling,
  speedText,
  steppedSpeed,
  usableChips,
  ZONE_LABEL,
} from '../model/treadmill-model';
import { SpeedGauge } from './speed-gauge';
import {
  ChipRow,
  PanelFrame,
  PanelTop,
  ReasonLine,
  StepButton,
  StepRow,
  type ChipProps,
} from './panel-parts';

const GAUGE_PX = 148;

const REASON_HINT = 'The reason is shown under the buttons.';

const NOT_RUNNING = 'Speed changes while the belt is running.';

interface Props {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}

function ReadLine({ speed }: { readonly speed: number }): ReactNode {
  const zone = movingZone(speed);
  return (
    <Text variant="callout" tone="variant">
      {zone === null ? 'Not moving' : `${ZONE_LABEL[zone]} · ${paceText(speed)}`}
    </Text>
  );
}

function reasonOf(view: TreadmillStateView, enabled: boolean): string | null {
  if (enabled) {
    return null;
  }
  if (view.link.phase !== 'linked') {
    return 'The treadmill is not linked to a phone yet.';
  }
  return view.pad.childLock === true
    ? 'Child lock is on; turn it off in the settings.'
    : NOT_RUNNING;
}

function Steppers({
  view,
  current,
  enabled,
  set,
}: {
  readonly view: TreadmillStateView;
  readonly current: number;
  readonly enabled: boolean;
  readonly set: (kmh: number) => void;
}): ReactNode {
  const limits = { min: view.limits.minKmh, ceiling: speedCeiling(view, !view.link.holderIsYou) };
  const hint = enabled ? 'Changes the speed by 0.1 kilometres per hour' : REASON_HINT;
  const chips: ChipProps[] = usableChips(limits).map((chip) => ({
    label: speedText(chip),
    spoken: `${speedText(chip)} kilometres per hour`,
    selected: chip === current,
    disabled: !enabled,
    hint: enabled ? 'Sets the speed' : REASON_HINT,
    onPress: (): void => {
      set(chip);
    },
  }));
  return (
    <>
      <StepRow>
        <StepButton
          icon="minus"
          label="Slower by 0.1 kilometres per hour"
          hint={hint}
          disabled={!enabled || current <= limits.min}
          onPress={() => {
            set(steppedSpeed(current, -1, limits));
          }}
        />
        <StepButton
          icon="plus"
          label="Faster by 0.1 kilometres per hour"
          hint={hint}
          disabled={!enabled || current >= limits.ceiling}
          onPress={() => {
            set(steppedSpeed(current, 1, limits));
          }}
        />
      </StepRow>
      <ChipRow chips={chips} />
    </>
  );
}

export function SpeedPanel({ deviceId, view }: Props): ReactNode {
  const control = useControl(deviceId, 'belt_speed');
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  const speed = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.speedKmh);
  const current = useLiveSelect(
    deviceId,
    view.frame,
    (frame) => frame.belt.targetSpeedKmh ?? frame.belt.speedKmh,
  );
  const enabled = controlsOf(view, state).speed;
  const reason = reasonOf(view, enabled);
  return (
    <PanelFrame title="Speed">
      <PanelTop gauge={<SpeedGauge deviceId={deviceId} view={view} size={GAUGE_PX} />}>
        <ReadLine speed={speed} />
      </PanelTop>
      {view.bodyVisible ? (
        <Steppers
          view={view}
          current={current}
          enabled={enabled}
          set={(kmh) => {
            background(control.set(kmh), 'control.set_failed');
          }}
        />
      ) : null}
      <ReasonLine
        reason={
          view.bodyVisible
            ? reason
            : 'Only the owner or the person on the belt can change the speed.'
        }
      />
    </PanelFrame>
  );
}
