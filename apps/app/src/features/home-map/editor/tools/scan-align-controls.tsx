import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMapScan } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import type { IconName } from '../../../../components/icon-glyphs';
import { Interactive } from '../../../../components/interactive';
import { NumberStepper } from '../../../../components/number-stepper';
import { Slider } from '../../../../components/slider';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { UNBOUNDED_CM } from '../list-editor/list-parts';
import type { ScanAlign } from './scan-align';
import {
  EMPTY_POINTS,
  fieldPatch,
  fitOp,
  opacityOp,
  pointsPrompt,
  residualText,
  transformOp,
  type ScanField,
} from './scan-align-model';

export const POINTS_HINT = 'Tap a point on the scan, then the same point on the floor.';

interface ScanControlProps {
  readonly align: ScanAlign;
  readonly scan: HomeMapScan;
}

function ToggleChip({
  label,
  icon,
  selected,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly icon: IconName;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      role="button"
      label={label}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-row items-center gap-1.5 rounded-full px-3',
        selected ? 'bg-primary-container' : 'bg-surface-1',
        disabled && 'opacity-60',
      )}
    >
      <Icon name={icon} size={16} tone={selected ? 'onPrimaryContainer' : 'variant'} />
      <Text variant="footnote" tone={selected ? 'onPrimaryContainer' : 'default'}>
        {label}
      </Text>
    </Interactive>
  );
}

interface FieldSpec {
  readonly field: ScanField;
  readonly label: string;
  readonly unit: string;
  readonly perUnit: number;
  readonly min: number;
}

const FIELDS: readonly FieldSpec[] = [
  { field: 'tx', label: 'X', unit: 'cm', perUnit: 100, min: -UNBOUNDED_CM },
  { field: 'ty', label: 'Y', unit: 'cm', perUnit: 100, min: -UNBOUNDED_CM },
  { field: 'yawDeg', label: 'Turn', unit: '°', perUnit: 1, min: -UNBOUNDED_CM },
  { field: 'scale', label: 'Scale', unit: '%', perUnit: 100, min: 1 },
  { field: 'tz', label: 'Lift', unit: 'cm', perUnit: 100, min: -UNBOUNDED_CM },
];

export function ScanFields({ align, scan }: ScanControlProps): ReactNode {
  const { transform } = scan;
  return (
    <View className="gap-2">
      {FIELDS.map((spec) => (
        <View key={spec.field} className="flex-row items-center gap-3">
          <Text variant="footnote" className="min-w-0 flex-1">
            {spec.label}
          </Text>
          <NumberStepper
            label={spec.label}
            unit={spec.unit}
            step={1}
            value={Math.round(transform[spec.field] * spec.perUnit)}
            min={spec.min}
            max={UNBOUNDED_CM}
            disabled={align.input.readOnly}
            onChange={(shown): void => {
              const patch = fieldPatch(spec.field, shown / spec.perUnit);
              if (patch !== null) align.send([transformOp(patch)]);
            }}
          />
        </View>
      ))}
    </View>
  );
}

export function ScanLevel({ align, scan }: ScanControlProps): ReactNode {
  const { levelled } = scan.transform;
  return (
    <View className="flex-row flex-wrap gap-2">
      <ToggleChip
        label="Keep level"
        icon="ruler"
        selected={levelled}
        disabled={align.input.readOnly}
        onPress={(): void => {
          align.send([transformOp({ levelled: !levelled })]);
        }}
      />
    </View>
  );
}

export function ScanOpacity({ align, scan }: ScanControlProps): ReactNode {
  const live = (value: number | null): void => {
    align.setOpacity(value === null ? null : value / 100);
  };
  return (
    <Slider
      label="Scan opacity"
      value={Math.round(scan.opacity * 100)}
      min={0}
      max={100}
      step={1}
      disabled={align.input.readOnly}
      formatValue={(value): string => `${String(value)}%`}
      onChange={live}
      onCancel={(): void => {
        live(null);
      }}
      onCommit={(value): void => {
        live(null);
        align.send([opacityOp(value / 100)]);
      }}
    />
  );
}

function PointsButtons({ align, scan }: ScanControlProps): ReactNode {
  const { draft } = align;
  const fit = draft.pending === null ? fitOp(draft, scan.transform.levelled) : null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {align.mode === 'points' ? (
        <Button
          label="Line up"
          icon="check"
          disabled={align.input.readOnly || fit === null}
          onPress={(): void => {
            if (fit === null) return;
            align.send([fit]);
            align.setDraft(() => EMPTY_POINTS);
            align.setMode('drag');
          }}
        />
      ) : (
        <Button
          label="Pick points"
          icon="mapPin"
          variant="tonal"
          disabled={align.input.readOnly}
          onPress={(): void => {
            align.setMode('points');
          }}
        />
      )}
      {align.mode === 'points' ? (
        <Button
          label="Cancel"
          variant="text"
          onPress={(): void => {
            align.setDraft(() => EMPTY_POINTS);
            align.setMode('drag');
          }}
        />
      ) : null}
    </View>
  );
}

export function ScanTwoPoints({ align, scan }: ScanControlProps): ReactNode {
  const residual = residualText(scan.residualM);
  return (
    <View className="gap-2">
      <Text variant="body-strong">Line up with two points</Text>
      <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
        {align.mode === 'points' ? pointsPrompt(align.draft) : POINTS_HINT}
      </Text>
      {residual === null ? null : (
        <Text variant="footnote" tone="positive" accessibilityLiveRegion="polite">
          {residual}
        </Text>
      )}
      <PointsButtons align={align} scan={scan} />
    </View>
  );
}
