import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { ListRow } from '../../components/list-row';
import { OtpField } from '../../components/otp-field';
import { List } from '../../components/section';
import { TextField } from '../../components/text-field';
import { useValue } from '../../design/external-store';
import type { PairingPresentation } from './pairing-actions';

function CodeInputs({ pairing }: { readonly pairing: PairingPresentation }): ReactNode {
  const code = useValue(pairing.code);
  const name = useValue(pairing.name);
  return (
    <>
      <OtpField
        label="Pairing code"
        format="pairing"
        value={code}
        onChange={pairing.code.set}
        onSubmit={() => {
          pairing.submit();
        }}
        focusOnMount
      />
      <TextField
        label="Name of this device"
        value={name}
        onChange={pairing.name.set}
        onSubmit={() => {
          pairing.submit();
        }}
      />
    </>
  );
}

export function CodeForm({
  pairing,
  home,
  checked,
}: {
  readonly pairing: PairingPresentation;
  readonly home: string;
  readonly checked: boolean;
}): ReactNode {
  const busy = useValue(pairing.busy);
  return (
    <View className="gap-4">
      <List inset>
        <ListRow
          icon="home"
          title={home}
          subtitle={checked ? 'Identity checked' : 'This browser’s home'}
          trailing={
            <Button
              label="Change"
              variant="text"
              onPress={() => {
                void pairing.change('welcome');
              }}
            />
          }
        />
      </List>
      <CodeInputs pairing={pairing} />
      <Button
        label="Pair"
        size="lg"
        loading={busy}
        onPress={() => {
          pairing.submit();
        }}
      />
      <Button
        label="Back"
        variant="text"
        onPress={() => {
          pairing.back();
        }}
      />
    </View>
  );
}
