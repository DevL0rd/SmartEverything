import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Icon, type IconName } from '../../../../components/icon';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';

interface Point {
  readonly icon: IconName;
  readonly text: string;
}

const POINTS: readonly Point[] = [
  {
    icon: 'eye',
    text: 'That includes notifications and anything you open. Pictures go to Gemini to answer you.',
  },
  { icon: 'muted', text: 'Sound from your screen is never shared.' },
  { icon: 'square', text: 'Stop from the notification, the call screen or the system chip.' },
];

export interface ShareExplainerProps {
  readonly open: boolean;
  readonly name: string;
  readonly onCancel: () => void;
  readonly onStart: () => void;
}

export function ShareExplainer({ open, name, onCancel, onStart }: ShareExplainerProps): ReactNode {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title="Share your screen?"
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="outlined" size="lg" grow onPress={onCancel} />
          <Button label="Start sharing" size="lg" grow onPress={onStart} />
        </>
      }
    >
      <View className="gap-4 pt-1">
        <Text variant="callout" tone="variant">
          {`${name} will see everything on your screen until you stop.`}
        </Text>
        {POINTS.map((point) => (
          <View key={point.icon} className="flex-row items-start gap-3">
            <Icon name={point.icon} size={20} tone="variant" />
            <Text variant="callout" className="min-w-0 flex-1">
              {point.text}
            </Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
