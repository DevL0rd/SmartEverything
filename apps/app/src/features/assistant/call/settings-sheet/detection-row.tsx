import type { ReactNode } from 'react';
import { View } from 'react-native';
import { VOICE_DETECTIONS } from '@smarteverything/domain';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { DETECTION_HINTS, DETECTION_LABELS, DETECTION_SEGMENTS } from '../model/listening-choices';
import { useCallAudio } from './call-audio-pref';

const OPTIONS = VOICE_DETECTIONS.map((value) => ({ value, label: DETECTION_SEGMENTS[value] }));

export function DetectionRow(): ReactNode {
  const { pref, change } = useCallAudio();
  return (
    <View className="gap-2 px-4 py-3">
      <Text variant="body">Voice detection</Text>
      <Segmented
        label="Voice detection"
        options={OPTIONS}
        value={pref.detection}
        onChange={(detection) => {
          change({ detection }, `Voice detection · ${DETECTION_LABELS[detection]}`);
        }}
      />
      <Text variant="footnote" tone="variant">
        {DETECTION_HINTS[pref.detection]}
      </Text>
    </View>
  );
}
