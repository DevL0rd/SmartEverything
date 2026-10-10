import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { ProfileRow } from '@smarteverything/domain';
import { assignBodyReading } from '../../api/people';
import { Button } from '../../components/button';
import { Figure } from '../../components/figure';
import { Interactive } from '../../components/interactive';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import { decimal } from '../../format/number';
import { moment } from '../../format/time';
import { useMinute } from '../../store/clock';
import { usePendingReadings, useProfiles, type WeighedReading } from '../../store/people';
import { useSettings } from '../../store/selectors';
import { ProfileAvatar } from './profile-avatar';
import { useMutationState } from '../../store/mutation';

function PersonChoice({
  profile,
  busy,
  onPick,
}: {
  readonly profile: ProfileRow;
  readonly busy: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`It was ${profile.name}`}
      onPress={onPick}
      disabled={busy}
      className="min-h-touch-min flex-row items-center gap-3 rounded-lg px-3 py-2"
    >
      <ProfileAvatar profile={profile} />
      <Text variant="body-strong">{profile.name}</Text>
    </Interactive>
  );
}

function useAssign(
  reading: WeighedReading,
  onClose: () => void,
): { readonly busy: boolean; readonly assign: (profileId: string | null) => void } {
  const mutation = useMutationState();
  return {
    busy: mutation.busy,
    assign: (profileId): void => {
      mutation.run(() => assignBodyReading(reading.id, profileId), {
        failure: 'The weigh-in was not saved',
        onDone: onClose,
      });
    },
  };
}

function NotUs({
  busy,
  assign,
}: {
  readonly busy: boolean;
  readonly assign: (profileId: string | null) => void;
}): ReactNode {
  return (
    <Button
      label="Not one of us"
      variant="text"
      disabled={busy}
      onPress={() => {
        assign(null);
      }}
    />
  );
}

function ReadingSheet({
  reading,
  onClose,
}: {
  readonly reading: WeighedReading;
  readonly onClose: () => void;
}): ReactNode {
  const profiles = useProfiles();
  const now = useMinute();
  const timeZone = useSettings().time_zone;
  const { busy, assign } = useAssign(reading, onClose);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Who was this?"
      detents={['fit']}
      footer={<NotUs busy={busy} assign={assign} />}
    >
      <View className="gap-4">
        <View className="gap-1">
          <Figure value={decimal(reading.weight_kg, 1)} unit="kg" size="xl" />
          <Text variant="footnote" tone="variant">
            {`On the scale ${moment(reading.measured_at, now, timeZone)}`}
          </Text>
        </View>
        <View className="gap-1">
          {profiles.map((profile) => (
            <PersonChoice
              key={profile.id}
              profile={profile}
              busy={busy}
              onPick={() => {
                assign(profile.id);
              }}
            />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

export function WhoWasThisHost(): ReactNode {
  const now = useMinute();
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const reading = usePendingReadings(now).find((item) => !dismissed.includes(item.id));
  if (reading === undefined) {
    return null;
  }
  return (
    <ReadingSheet
      key={reading.id}
      reading={reading}
      onClose={() => {
        setDismissed([...dismissed, reading.id]);
      }}
    />
  );
}
