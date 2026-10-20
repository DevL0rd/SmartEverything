import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Rings } from '../../../components/charts';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMaxHeartRateSetting } from '../../../features/fitness/data/goals';
import { useSessionTarget } from '../data/session-target';
import { useLiveSelect } from '../data/treadmill-data';
import {
  KIND_LABEL,
  targetProgress,
  zoneBand,
  type SessionTarget,
  type TargetProgress,
} from '../model/target-model';
import { GoalSheet } from './goal-sheet';

const RING_PX = 96;

function ZoneLine({ target }: { readonly target: SessionTarget }): ReactNode {
  const maxBpm = useMaxHeartRateSetting();
  if (target.zone === null) {
    return null;
  }
  return (
    <Text variant="caption" tone="variant" className="tabular">
      {maxBpm === null ? 'Target heart rate zone' : zoneBand(target.zone, maxBpm)}
    </Text>
  );
}

function TargetCard({
  target,
  progress,
  onPress,
}: {
  readonly target: SessionTarget;
  readonly progress: TargetProgress | null;
  readonly onPress: () => void;
}): ReactNode {
  const sentence = progress === null ? 'Target heart rate zone' : progress.label;
  return (
    <Interactive
      role="button"
      label={`Session target, ${sentence}. Change target`}
      onPress={onPress}
      className="flex-row flex-wrap items-center gap-4 rounded-md bg-surface-2 p-3"
    >
      {progress === null ? null : (
        <Rings
          size={RING_PX}
          rings={[
            {
              progress: progress.share,
              colour: target.kind === 'climb' ? 'viz-violet' : 'primary',
              label: progress.label,
            },
          ]}
        />
      )}
      <View className="min-w-48 flex-1">
        <Text variant="caption" tone="variant">
          {progress === null ? 'Session target' : `Session target, ${KIND_LABEL[target.kind]}`}
        </Text>
        {progress === null ? null : (
          <Text variant="body-strong" className="tabular">
            {progress.reached ? `Reached, ${progress.label}` : progress.label}
          </Text>
        )}
        <ZoneLine target={target} />
      </View>
    </Interactive>
  );
}

export function GoalRing({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const target = useSessionTarget(deviceId);
  const progress = targetProgress(
    target,
    useLiveSelect(deviceId, view.frame, (frame) => frame),
  );
  const show = (): void => {
    setOpen(true);
  };
  if (!view.bodyVisible) {
    return null;
  }
  const none = progress === null && target.zone === null;
  return (
    <>
      {none ? (
        <Button label="Set a target" variant="tonal" icon="trophy" onPress={show} />
      ) : (
        <TargetCard target={target} progress={progress} onPress={show} />
      )}
      <GoalSheet
        key={`${target.kind}-${target.zone ?? 'any'}`}
        deviceId={deviceId}
        view={view}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}
