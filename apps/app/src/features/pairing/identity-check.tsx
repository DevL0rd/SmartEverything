import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { HubPairingObservation } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { HomeIdentity } from '../../components/home-identity';
import { useValue } from '../../design/external-store';
import type { PairingPresentation } from './pairing-actions';

export function IdentityCheck({
  observation,
  pairing,
}: {
  readonly observation: HubPairingObservation;
  readonly pairing: PairingPresentation;
}): ReactNode {
  const busy = useValue(pairing.busy);
  return (
    <View className="gap-4">
      <HomeIdentity
        value={observation.tls.publicKeySha256}
        helper="Compare every group before continuing. Scanning the QR code does this for you."
      />
      <Button
        label="It matches"
        size="lg"
        loading={busy}
        onPress={() => {
          pairing.confirm();
        }}
      />
      <Button
        label="Choose another home"
        variant="text"
        onPress={() => {
          void pairing.change('nearby');
        }}
      />
    </View>
  );
}
