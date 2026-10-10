import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { pairingFromTyped, serverAddressOf } from '../../api/pairing-input';
import type { StoredKind } from '../../api/transport';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { OtpField } from '../../components/otp-field';
import { TextField } from '../../components/text-field';
import { defaultDeviceName, serverCheckOf, usePairing, type ServerCheck } from './pairing';

function helperOf(check: ServerCheck): string {
  switch (check.state) {
    case 'idle':
      return 'The address you use for remote access';
    case 'checking':
      return 'Checking…';
    case 'found':
      return `Found SmartEverything ${check.status.version}`;
    case 'failed':
      return '';
  }
}

function ServerField({
  value,
  onChange,
  check,
  onCheck,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly check: ServerCheck;
  readonly onCheck: (check: ServerCheck) => void;
}): ReactNode {
  const run = (): void => {
    const address = serverAddressOf(value, false);
    if (!address.ok) {
      onCheck({ state: 'failed', problem: address.problem });
      return;
    }
    onCheck({ state: 'checking' });
    serverCheckOf(address.url, onCheck);
  };
  return (
    <TextField
      label="Server address"
      kind="url"
      value={value}
      onChange={(next) => {
        onChange(next);
        onCheck({ state: 'idle' });
      }}
      onBlur={() => {
        if (value.trim() !== '') {
          run();
        }
      }}
      onSubmit={run}
      placeholder="https://your-server"
      helper={helperOf(check)}
      error={check.state === 'failed' ? check.problem : null}
    />
  );
}

export function CodeForm({
  kind,
  fixedUrl,
  onBack,
}: {
  readonly kind: StoredKind;
  readonly fixedUrl: string | null;
  readonly onBack: (() => void) | null;
}): ReactNode {
  const [server, setServer] = useState(fixedUrl ?? '');
  const [check, setCheck] = useState<ServerCheck>({ state: 'idle' });
  const [code, setCode] = useState('');
  const [name, setName] = useState(defaultDeviceName(kind));
  const pairing = usePairing(kind);
  const submit = (): void => {
    const address = serverAddressOf(server, false);
    if (!address.ok) {
      setCheck({ state: 'failed', problem: address.problem });
      return;
    }
    const input = pairingFromTyped(address.url, code, false);
    if (!input.ok) {
      pairing.fail(input.problem);
      return;
    }
    pairing.pair(input.target, name);
  };
  return (
    <View className="gap-4">
      {fixedUrl === null ? (
        <ServerField value={server} onChange={setServer} check={check} onCheck={setCheck} />
      ) : null}
      <OtpField
        label="Pairing code"
        format="pairing"
        value={code}
        onChange={setCode}
        onSubmit={submit}
        focusOnMount={fixedUrl !== null}
      />
      <TextField label="Name of this device" value={name} onChange={setName} onSubmit={submit} />
      {pairing.problem === null ? null : <Banner tone="critical" title={pairing.problem} />}
      <Button label="Pair" size="lg" loading={pairing.busy} onPress={submit} />
      {onBack === null ? null : <Button label="Back" variant="text" onPress={onBack} />}
    </View>
  );
}
