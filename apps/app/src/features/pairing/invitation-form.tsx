import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { parsePairingInvitation, type PairingInvitationParse } from '@smarteverything/domain';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { TextField } from '../../components/text-field';
import { useValue } from '../../design/external-store';
import type { PairingPresentation } from './pairing-actions';
import { background } from '@smarteverything/logging';

function InvitationPreview({
  invitation,
  pairing,
}: {
  readonly invitation: PairingInvitationParse;
  readonly pairing: PairingPresentation;
}): ReactNode {
  if (!invitation.ok) return <Banner tone="critical" title={invitation.problem} />;
  const target = invitation.invitation;
  return (
    <View className="gap-4">
      <List inset>
        <ListRow
          icon="home"
          title={target.identity.name}
          subtitle="The invitation shares access to this home."
          wrapSubtitle
        />
      </List>
      <Button
        label="Continue"
        size="lg"
        onPress={() => {
          background(pairing.target(target, false), 'pairing.target_failed');
        }}
      />
      <Button
        label="Use another invitation"
        variant="text"
        onPress={() => {
          pairing.clear();
        }}
      />
    </View>
  );
}

function InvitationInput({ pairing }: { readonly pairing: PairingPresentation }): ReactNode {
  const [text, setText] = useState('');
  const read = (): void => {
    const parsed = parsePairingInvitation(text);
    setText('');
    pairing.invitation.set(parsed);
  };
  return (
    <View className="gap-4">
      <TextField
        label="Invitation link"
        kind="url"
        value={text}
        onChange={setText}
        helper="Ask the owner to copy it from Pair a phone."
        onSubmit={read}
        focusOnMount
      />
      <Button label="Check invitation" size="lg" onPress={read} />
    </View>
  );
}

export function InvitationForm({ pairing }: { readonly pairing: PairingPresentation }): ReactNode {
  const invitation = useValue(pairing.invitation);
  return (
    <View className="gap-4">
      {invitation?.ok !== true ? <InvitationInput pairing={pairing} /> : null}
      {invitation === null ? null : <InvitationPreview invitation={invitation} pairing={pairing} />}
      <Button
        label="Back"
        variant="text"
        onPress={() => {
          background(pairing.change('welcome'), 'pairing.change_failed');
        }}
      />
    </View>
  );
}
