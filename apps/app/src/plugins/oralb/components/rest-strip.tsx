import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import type { DeviceProps } from '../../toothbrush/brand-ui';
import { useFrame } from '../../toothbrush/data/brush-data';
import { isBrushingNow } from '../../toothbrush/model/brush-model';
import { useOralbSettings } from '../data/use-oralb';
import { restNotes } from '../model/rest-model';
import { angleOf, restLine } from '../model/wave-model';

export function OralbRestStrip({ deviceId, view }: DeviceProps): ReactNode {
  const frame = useFrame(deviceId, view.frame);
  const { missed } = useOralbSettings(deviceId);
  if (isBrushingNow(frame.activity)) {
    return null;
  }
  const protocol = view.handle.oralb?.protocol ?? null;
  const notes = restNotes(protocol, missed, clock);
  return (
    <View className="gap-1.5">
      {frame.mode === null ? null : (
        <Text variant="callout">{restLine(frame.mode, angleOf(frame, false))}</Text>
      )}
      {notes.map((note) => (
        <Text key={note} variant="footnote" tone="variant">
          {note}
        </Text>
      ))}
    </View>
  );
}
