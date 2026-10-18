import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { STATUS_FILL } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePhoneLiveHeld } from '../data/phone-live';
import { usePhoneFace } from '../card/use-phone-face';

export function PhoneStatusRow({ device }: { readonly device: Device }): ReactNode {
  const { access, word, online } = usePhoneFace(device);
  const live = usePhoneLiveHeld(device.id);
  const profileId = device.details['profileId'];
  const person = useRow('profiles', typeof profileId === 'string' ? profileId : null)?.name;
  const tone = online ? word.tone : 'neutral';
  return (
    <View className="flex-row flex-wrap items-center gap-2 pt-1">
      <View className="flex-row items-center gap-1.5">
        <View
          aria-hidden
          className={cn(
            'size-2 rounded-full',
            tone === 'neutral' ? 'bg-on-surface-faint' : STATUS_FILL[tone],
          )}
        />
        <Text variant="footnote" tone={online ? 'default' : 'variant'}>
          {word.word}
        </Text>
      </View>
      {person === undefined ? null : <Badge label={person} icon="user" />}
      {access.view.here ? <Badge label="This phone" tone="primary" icon="smartphone" /> : null}
      {live && online ? <Badge label="Live" tone="positive" icon="activity" /> : null}
    </View>
  );
}
