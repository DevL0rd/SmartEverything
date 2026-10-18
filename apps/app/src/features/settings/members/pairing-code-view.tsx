import type { ReactNode } from 'react';
import { View } from 'react-native';
import { pairingInvitationText, type Pairing } from '@smarteverything/domain';
import { pairingQrText } from '../../../api/pairing-input';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { CopyField } from '../../../components/copy-field';
import { copyText } from '../../../components/copy-button';
import { QrCode } from '../../../components/qr-code';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';

function InvitationActions({ pairing }: { readonly pairing: Pairing }): ReactNode {
  const invitation = pairingInvitationText(pairing.qr);
  const remote = pairing.qr.endpoints.some((endpoint) => endpoint.kind === 'remote');
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
      {remote ? null : (
        <>
          <Text variant="callout" tone="variant">
            Works on your home network. Set up Remote access to connect from elsewhere.
          </Text>
          <Button label="Set up remote access" variant="text" href={href.settings.page('server')} />
        </>
      )}
    </View>
  );
}

export function PairingCodeView({ pairing }: { readonly pairing: Pairing }): ReactNode {
  return (
    <View className="gap-4">
      <QrCode text={pairingQrText(pairing.qr)} size={232} label="Pairing code to scan" />
      <Text variant="callout" tone="variant" align="center">
        {`On the phone, open SmartEverything and scan this. Expires at ${clock(pairing.expiresAt)}.`}
      </Text>
      <CopyField label="Server address" value={pairing.qr.url} />
      <CopyField label="Or enter this code" value={pairing.code} />
      <InvitationActions pairing={pairing} />
    </View>
  );
}
