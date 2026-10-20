import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { ChoiceChip } from '../../../components/choice-chip';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { ZONES, type ZoneKey } from '../../../features/fitness/model/heart';
import { setSessionTarget, useSessionTarget } from '../data/session-target';
import {
  KIND_LABEL,
  NO_TARGET,
  TARGET_KINDS,
  targetUnit,
  type SessionTarget,
  type TargetKind,
} from '../model/target-model';

const KINDS = TARGET_KINDS.filter((kind) => kind !== 'none').map((kind) => ({
  value: kind,
  label: KIND_LABEL[kind],
}));

const ZONE_OPTIONS = [
  { value: '', label: 'Any zone' },
  ...ZONES.map((zone) => ({ value: zone.key, label: zone.label })),
];

interface Props {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
  readonly open: boolean;
  readonly onClose: () => void;
}

function startValue(current: SessionTarget, kind: Exclude<TargetKind, 'none'>): number {
  const unit = targetUnit(kind);
  return current.kind === kind ? current.value / unit.factor : unit.initial;
}

function ValueField({
  kind,
  value,
  onChange,
}: {
  readonly kind: Exclude<TargetKind, 'none'>;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactNode {
  const unit = targetUnit(kind);
  return (
    <NumberStepper
      label={`Target in ${unit.unit}`}
      value={value}
      min={unit.min}
      max={unit.max}
      step={unit.step}
      unit={unit.unit}
      onChange={onChange}
    />
  );
}

interface Draft {
  readonly kind: Exclude<TargetKind, 'none'>;
  readonly value: number;
  readonly zone: ZoneKey | null;
  readonly current: SessionTarget;
  readonly pick: (kind: Exclude<TargetKind, 'none'>) => void;
  readonly setValue: (value: number) => void;
  readonly setZone: (zone: ZoneKey | null) => void;
  readonly save: () => void;
  readonly clear: () => void;
}

function useTargetDraft(deviceId: string, onClose: () => void): Draft {
  const current = useSessionTarget(deviceId);
  const [kind, setKind] = useState<Exclude<TargetKind, 'none'>>(
    current.kind === 'none' ? 'time' : current.kind,
  );
  const [value, setValue] = useState(() => startValue(current, kind));
  const [zone, setZone] = useState<ZoneKey | null>(current.zone);
  return {
    kind,
    value,
    zone,
    current,
    setValue,
    setZone,
    pick: (next): void => {
      setKind(next);
      setValue(startValue(current, next));
    },
    save: (): void => {
      setSessionTarget(deviceId, { kind, value: value * targetUnit(kind).factor, zone });
      onClose();
    },
    clear: (): void => {
      setSessionTarget(deviceId, NO_TARGET);
      onClose();
    },
  };
}

export function GoalSheet({ deviceId, view, open, onClose }: Props): ReactNode {
  const draft = useTargetDraft(deviceId, onClose);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Session target"
      label="Session target"
      detents={['fit']}
    >
      <View className="gap-4 p-4">
        <Text variant="callout" tone="variant">
          The page counts toward this target during the session. The belt is never stopped by it.
        </Text>
        <Segmented
          label="Target kind"
          options={KINDS}
          value={draft.kind}
          fill
          onChange={draft.pick}
        />
        <ValueField kind={draft.kind} value={draft.value} onChange={draft.setValue} />
        {view.bodyVisible ? (
          <ChoiceChip
            label="Heart rate zone"
            icon="heartPulse"
            all=""
            value={draft.zone ?? ''}
            options={ZONE_OPTIONS}
            onChange={(next) => {
              draft.setZone(ZONES.find((entry) => entry.key === next)?.key ?? null);
            }}
          />
        ) : null}
        <Button label="Save target" size="lg" onPress={draft.save} />
        {draft.current.kind === 'none' && draft.current.zone === null ? null : (
          <Button label="Clear target" variant="text" onPress={draft.clear} />
        )}
      </View>
    </BottomSheet>
  );
}
