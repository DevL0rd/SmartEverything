import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ComputerFeature, DisplayChangeInput, DisplayOutput } from '@smarteverything/domain';
import { DISPLAY_ROTATIONS, DISPLAY_SIDES, DISPLAY_VRR_POLICIES } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { SwitchRow } from '../../../components/rows';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { LevelSlider } from '../audio/level-slider';
import {
  CUSTOM_SCALE,
  isCustomScale,
  mirrorOptions,
  modeOfChoice,
  refreshOptions,
  resolutionOptions,
  resolutionValue,
  rotationLabel,
  scaleOptions,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  SIDE_LABELS,
} from '../model/displays-model';

type Send = (change: DisplayChangeInput) => void;

interface FieldsProps {
  readonly output: DisplayOutput;
  readonly outputs: readonly DisplayOutput[];
  readonly features: readonly ComputerFeature[] | undefined;
  readonly disabled: boolean;
  readonly send: Send;
}

function offers(features: FieldsProps['features'], feature: ComputerFeature): boolean {
  return features === undefined || features.includes(feature);
}

function ModeFields({ output, disabled, send }: FieldsProps): ReactNode {
  const size = resolutionValue(output);
  const hz = output.mode === null ? null : String(output.mode.refreshHz);
  const choose = (nextSize: string, nextHz: string | null): void => {
    const mode = modeOfChoice(output, nextSize, nextHz);
    if (mode === null) return;
    send({
      action: 'mode',
      output: output.id,
      width: mode.width,
      height: mode.height,
      refreshHz: mode.refreshHz,
    });
  };
  return (
    <>
      <Select
        label="Resolution"
        options={resolutionOptions(output)}
        value={size}
        disabled={disabled}
        onChange={(next) => {
          choose(next, hz);
        }}
      />
      <Select
        label="Refresh rate"
        options={refreshOptions(output, size)}
        value={hz}
        disabled={disabled || size === null}
        onChange={(next) => {
          if (size !== null) choose(size, next);
        }}
      />
    </>
  );
}

function Orientation({
  output,
  disabled,
  send,
}: Omit<FieldsProps, 'outputs' | 'features'>): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        Orientation
      </Text>
      <Segmented
        label="Orientation"
        value={String(output.rotation)}
        disabled={disabled}
        options={DISPLAY_ROTATIONS.map((degrees) => ({
          value: String(degrees),
          label: rotationLabel(degrees),
        }))}
        onChange={(next) => {
          const degrees = DISPLAY_ROTATIONS.find((candidate) => String(candidate) === next);
          if (degrees !== undefined) send({ action: 'rotation', output: output.id, degrees });
        }}
      />
    </View>
  );
}

function ScaleFields({ output, disabled, send }: FieldsProps): ReactNode {
  const [custom, setCustom] = useState(false);
  const showCustom = custom || isCustomScale(output.scalePercent);
  const setScale = (percent: number): void => {
    send({ action: 'scale', output: output.id, percent });
  };
  return (
    <>
      <Select
        label="Scale"
        options={scaleOptions()}
        value={showCustom ? CUSTOM_SCALE : String(output.scalePercent)}
        disabled={disabled}
        onChange={(next) => {
          if (next === CUSTOM_SCALE) {
            setCustom(true);
            return;
          }
          setCustom(false);
          setScale(Number(next));
        }}
      />
      {showCustom ? (
        <NumberStepper
          label="Custom scale"
          value={output.scalePercent}
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={SCALE_STEP}
          unit="%"
          disabled={disabled}
          onChange={setScale}
        />
      ) : null}
      <Orientation {...{ output, disabled, send }} />
    </>
  );
}

const VRR_LABELS = { never: 'Never', always: 'Always', automatic: 'Automatic' } as const;

function Brightness({
  output,
  disabled,
  send,
}: Omit<FieldsProps, 'outputs' | 'features'>): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        Brightness
      </Text>
      <View className="flex-row items-center gap-2">
        <LevelSlider
          label={output.builtIn ? 'Built-in display brightness' : 'Brightness'}
          value={output.brightness}
          max={100}
          disabled={disabled}
          muted={false}
          onCommit={(level) => {
            send({ action: 'brightness', level, output: output.id });
          }}
        />
      </View>
    </View>
  );
}

function AdaptiveSync({
  output,
  policy,
  disabled,
  send,
}: Omit<FieldsProps, 'outputs' | 'features'> & {
  readonly policy: (typeof DISPLAY_VRR_POLICIES)[number];
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        Adaptive sync
      </Text>
      <Segmented
        label="Adaptive sync"
        value={policy}
        disabled={disabled}
        options={DISPLAY_VRR_POLICIES.map((option) => ({
          value: option,
          label: VRR_LABELS[option],
        }))}
        onChange={(next) => {
          send({ action: 'vrr', output: output.id, policy: next });
        }}
      />
    </View>
  );
}

function PictureFields({ output, features, disabled, send }: FieldsProps): ReactNode {
  return (
    <>
      {output.brightness !== null && offers(features, 'brightness') ? (
        <Brightness {...{ output, disabled, send }} />
      ) : null}
      {output.hdr.supported && offers(features, 'hdr') ? (
        <SwitchRow
          title="HDR"
          value={output.hdr.enabled}
          disabled={disabled}
          onChange={(enabled) => {
            send({ action: 'hdr', output: output.id, enabled });
          }}
        />
      ) : null}
      {output.vrr !== null && offers(features, 'vrr') ? (
        <AdaptiveSync {...{ output, disabled, send }} policy={output.vrr} />
      ) : null}
    </>
  );
}

function positionChoices(
  outputs: readonly DisplayOutput[],
  id: string,
): readonly { readonly value: string; readonly label: string }[] {
  return mirrorOptions(outputs, id).flatMap((other) =>
    DISPLAY_SIDES.map((side) => ({
      value: `${side}:${other.value}`,
      label: `${SIDE_LABELS[side]} ${other.label}`,
    })),
  );
}

function LayoutFields({ output, outputs, disabled, send }: FieldsProps): ReactNode {
  const others = mirrorOptions(outputs, output.id);
  if (others.length === 0) return null;
  return (
    <>
      <Select
        label="Mirror of"
        options={[{ value: '', label: 'Not mirrored' }, ...others]}
        value={output.mirrorOf ?? ''}
        disabled={disabled}
        onChange={(next) => {
          send({ action: 'mirror', output: output.id, of: next === '' ? null : next });
        }}
      />
      <Select
        label="Position"
        options={positionChoices(outputs, output.id)}
        value={null}
        placeholder="Choose where it sits"
        disabled={disabled}
        onChange={(next) => {
          const [side, relativeTo] = next.split(':');
          const known = DISPLAY_SIDES.find((key) => key === side);
          if (known === undefined || relativeTo === undefined) return;
          send({ action: 'position', output: output.id, relativeTo, side: known });
        }}
      />
    </>
  );
}

export function DisplaySheet(props: {
  readonly output: DisplayOutput | null;
  readonly outputs: readonly DisplayOutput[];
  readonly features: readonly ComputerFeature[] | undefined;
  readonly offline: boolean;
  readonly onClose: () => void;
  readonly onToggle: (output: DisplayOutput, enabled: boolean) => void;
  readonly send: Send;
}): ReactNode {
  const { output, outputs, features, offline, onClose, onToggle, send } = props;
  if (output === null) return null;
  const fields = { output, outputs, features, disabled: offline, send };
  const modes = output.modes.length > 0 && offers(features, 'display_modes');
  return (
    <Sheet open onClose={onClose} title={output.name} kind="inspector" detents={['half', 'full']}>
      <View className="gap-4 pb-4">
        {offers(features, 'display_enable') ? (
          <SwitchRow
            title="Enabled"
            value={output.enabled}
            disabled={offline}
            onChange={(enabled) => {
              onToggle(output, enabled);
            }}
          />
        ) : null}
        {output.enabled ? (
          <>
            <Text variant="caption" tone="variant">
              Resolution, refresh rate, scale, orientation and position ask you to keep the change.
            </Text>
            {modes ? <ModeFields {...fields} /> : null}
            <ScaleFields {...fields} />
            <SwitchRow
              title="Primary"
              value={output.primary}
              disabled={offline || output.primary}
              onChange={() => {
                send({ action: 'primary', output: output.id });
              }}
            />
            <PictureFields {...fields} />
            <LayoutFields {...fields} />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
