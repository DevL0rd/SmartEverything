import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import type { ReasonAction } from '../../../components/reason-line';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import type { ComposerStatus, StatusKind } from '../model/composer-state';

interface Face {
  readonly icon: IconName;
  readonly tone: Tone;
}

const FACE: Readonly<Record<StatusKind, Face>> = {
  engine: { icon: 'warning', tone: 'warning' },
  profile: { icon: 'user', tone: 'variant' },
  attachment: { icon: 'warning', tone: 'warning' },
  failedUpload: { icon: 'warning', tone: 'warning' },
  uploading: { icon: 'upload', tone: 'variant' },
  offline: { icon: 'wifiOff', tone: 'variant' },
};

export function ComposerStatusLine({
  status,
  actions,
}: {
  readonly status: ComposerStatus;
  readonly actions: readonly ReasonAction[];
}): ReactNode {
  const face = FACE[status.kind];
  return (
    <View className="min-h-touch-min flex-row flex-wrap items-center gap-x-2 px-2">
      <Icon name={face.icon} size={16} tone={face.tone} />
      <Text
        variant="footnote"
        tone="variant"
        className="min-w-0 flex-1"
        accessibilityLiveRegion="polite"
      >
        {status.text}
      </Text>
      {actions.map((action) => (
        <Button key={action.label} label={action.label} variant="text" onPress={action.onPress} />
      ))}
    </View>
  );
}
