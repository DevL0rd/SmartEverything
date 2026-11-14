import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BrandMark } from '../../../components/brand-mark';
import { StatusDot } from '../../../components/status-dot';
import type { StatusTone } from '../../../components/tone';

const DOT_LABEL: Readonly<Record<StatusTone, string>> = {
  positive: 'Linked',
  critical: 'Needs attention',
  info: 'Signing in',
  warning: 'Needs a look',
};

export function GoogleMark({
  dot,
  size,
}: {
  readonly dot: StatusTone | null;
  readonly size: 32 | 40;
}): ReactNode {
  return (
    <View className="relative">
      <BrandMark brand="google" size={size} />
      {dot === null ? null : <StatusDot tone={dot} label={DOT_LABEL[dot]} ring="surface-1" />}
    </View>
  );
}
