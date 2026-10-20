import type { BrushLiveFrame } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { DriveWave } from '../charts/drive-wave';
import {
  EASE_NOTE,
  TONGUE_STOP_S,
  amplitudeShare,
  angleOf,
  oralbModeOf,
  waveLabel,
} from '../model/wave-model';
import { connectedOf } from '../model/stage-model';

export function WaveRow({
  frame,
  width,
  moving,
}: {
  readonly frame: BrushLiveFrame;
  readonly width: number;
  readonly moving: boolean;
}): ReactNode {
  const mode = oralbModeOf(frame.mode);
  const angle = angleOf(frame, connectedOf(frame));
  const tooHard = frame.pressure === 'too_high';
  const eased = tooHard && angle.source === 'live';
  const running = moving && frame.activity === 'brushing';
  return (
    <View className="gap-1">
      <DriveWave
        width={width}
        mode={mode}
        share={amplitudeShare(angle, tooHard)}
        moving={running}
        tooHard={tooHard}
        angle={angle}
        label={waveLabel(frame.mode, angle, eased)}
      />
      {eased ? (
        <Text variant="caption" tone="variant">
          {EASE_NOTE}
        </Text>
      ) : null}
      {mode === 'tongue_clean' ? (
        <Text variant="caption" tone="variant">
          Stops at {String(TONGUE_STOP_S)} s
        </Text>
      ) : null}
    </View>
  );
}
