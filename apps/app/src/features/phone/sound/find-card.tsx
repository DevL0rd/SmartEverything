import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { RingButton } from '../card/face-controls';
import type { PhoneAccess } from '../model/face-model';
import type { Device } from '../../../store/state';

export function FindCard({
  device,
  access,
  ringing,
  person,
}: {
  readonly device: Device;
  readonly access: PhoneAccess;
  readonly ringing: boolean;
  readonly person: string;
}): ReactNode {
  const { view } = access;
  return (
    <Card title="Find my phone" icon="siren">
      <Text variant="footnote" tone="variant">
        Rings at full volume even on silent
      </Text>
      {view.here ? (
        <Text variant="callout" tone="variant">
          This is the phone in your hand. Open this page on another device to ring it.
        </Text>
      ) : view.canRing ? (
        <RingButton device={device} ringing={ringing} compact={false} />
      ) : (
        <Text variant="callout" tone="variant">
          {`Only ${person} and the owner can ring it.`}
        </Text>
      )}
    </Card>
  );
}
