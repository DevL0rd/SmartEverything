import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { pairingInvitationText, type Pairing } from '@smarteverything/domain';
import { pairingQrText } from '../../../api/pairing-input';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { CopyField } from '../../../components/copy-field';
import { copyText } from '../../../components/copy-button';
import { HomeIdentity } from '../../../components/home-identity';
import { QrCode } from '../../../components/qr-code';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';

function InvitationActions({ pairing }: { readonly pairing: Pairing }): ReactNode {
  const invitation = pairingInvitationText(pairing.qr);
  const remote = pairing.qr.endpoints?.some((endpoint) => endpoint.kind === 'remote');
  return (
    <View className="gap-3">
      {invitation === null ? null : (
        <Button
          label="Copy invitation"
          variant="tonal"
          onPress={() => {
            copyText(invitation, 'Invitation');
          }}
        />
      )}
      {remote === false ? (
        <>
          <Text variant="callout" tone="variant">
            Works on your home network. Set up Remote access to connect from elsewhere.
          </Text>
          <Button label="Set up remote access" variant="text" href={href.settings.page('server')} />
        </>
      ) : null}
    </View>
  );
}

export function PairingCodeView({ pairing }: { readonly pairing: Pairing }): ReactNode {
  const [legacy, setLegacy] = useState(false);
  const qr = legacy && pairing.legacyQr !== undefined ? pairing.legacyQr : pairing.qr;
  return (
    <View className="gap-4">
      <QrCode
        text={pairingQrText(qr)}
        size={232}
        label={legacy ? 'Pairing code for an older app' : 'Pairing code to scan'}
      />
      <Text variant="callout" tone="variant" align="center">
        {`On the phone, open SmartEverything and scan this. Expires at ${clock(pairing.expiresAt)}.`}
      </Text>
      <CopyField label="Or enter this code" value={pairing.code} />
      {pairing.qr.identity === undefined ? null : (
        <HomeIdentity
          value={pairing.qr.identity.tls.publicKeySha256}
          helper="If entering a code, compare this on the other device first."
        />
      )}
      <InvitationActions pairing={pairing} />
      {pairing.legacyQr === undefined ? null : (
        <Button
          label={legacy ? 'Show current QR code' : 'Pair an older app'}
          variant="text"
          onPress={() => {
            setLegacy(!legacy);
          }}
        />
      )}
    </View>
  );
}
