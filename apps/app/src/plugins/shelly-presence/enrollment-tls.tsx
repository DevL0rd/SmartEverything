import { useLocalSearchParams } from 'expo-router';
import type { ShellyTransportTls } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { TextField } from '../../components/text-field';
import { Button } from '../../components/button';
import { SwitchRow } from '../../components/rows';
import { Text } from '../../components/text';
import { pickTextFile } from '../../platform/text-file';
export type EnrollmentTls = ShellyTransportTls;
const TLS_FIELDS = [
  { key: 'caPem', title: 'Trusted CA certificate', secret: false },
  { key: 'clientCertificate', title: 'Client certificate', secret: false },
  { key: 'clientKey', title: 'Client private key', secret: true },
] as const;
function PemInput({
  field,
  value,
  change,
}: {
  readonly field: (typeof TLS_FIELDS)[number];
  readonly value: string | null;
  readonly change: (value: string | null) => void;
}): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const importFile = (): void => {
    pickTextFile('application/x-pem-file,text/plain')
      .then((text) => {
        if (text !== null) {
          change(text);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        setError(String(caught));
      });
  };
  return (
    <View className="gap-2">
      <TextField
        label={field.title}
        kind={field.secret ? 'password' : 'text'}
        multiline={!field.secret}
        value={value ?? ''}
        onChange={(next) => {
          change(next === '' ? null : next);
        }}
      />
      <Button
        label={`Import ${field.title.toLowerCase()}`}
        icon="upload"
        variant="text"
        onPress={importFile}
      />
      {error === null ? null : <Text tone="critical">{error}</Text>}
    </View>
  );
}
export function EnrollmentTlsFields({
  value,
  change,
}: {
  readonly value: EnrollmentTls;
  readonly change: (value: EnrollmentTls) => void;
}): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string }>();
  const [expanded, setExpanded] = useState(
    params.focus === 'Custom HTTPS certificates' ||
      TLS_FIELDS.some((field) => field.title === params.focus),
  );
  return (
    <View className="gap-3">
      <SwitchRow title="Custom HTTPS certificates" value={expanded} onChange={setExpanded} />
      {expanded ? (
        <View className="gap-3">
          {TLS_FIELDS.map((field) => (
            <PemInput
              key={field.key}
              field={field}
              value={value[field.key]}
              change={(next) => {
                change({ ...value, [field.key]: next });
              }}
            />
          ))}
          <Text variant="footnote" tone="variant">
            Client certificate and private key must be supplied together. Certificate verification
            stays enabled.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
