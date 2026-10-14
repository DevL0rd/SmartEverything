import { EnrollmentTlsFields, type EnrollmentTls } from './enrollment-tls';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  SHELLY_DISCOVERY_RESULT,
  SHELLY_PRESENCE_ENROLL_REQUEST,
  SHELLY_PRESENCE_ENROLL_RESULT,
  SHELLY_PRESENCE_FORGET_RESULT,
  SHELLY_PRESENCE_PLUGIN_ID,
  SHELLY_PRESENCE_SNAPSHOT,
  SHELLY_PRESENCE_STREAM,
} from '@smarteverything/domain';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { callPluginTool } from '../../api/plugins';
import { useIsOwner } from '../../store/selectors';
import { usePluginStream } from '../shared/use-plugin-stream';

function EnrollForm({
  address,
  changeAddress,
}: {
  readonly address: string;
  readonly changeAddress: (value: string) => void;
}): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string }>();
  const { password, setPassword, tls, setTls, busy, message, enroll } = useEnroll(address);
  return (
    <View className="gap-3">
      <TextField
        label="Sensor address"
        focusOnMount={params.focus === 'Sensor address'}
        kind="url"
        value={address}
        onChange={changeAddress}
        helper="HTTP or HTTPS origin, for example http://shelly-presence.local"
      />
      <TextField
        label="Local access password"
        focusOnMount={params.focus === 'Local access password'}
        kind="password"
        value={password}
        onChange={setPassword}
        helper="Leave blank if local authentication is disabled"
      />
      {address.startsWith('https://') ? <EnrollmentTlsFields value={tls} change={setTls} /> : null}
      <Button
        label="Connect configured sensor"
        loading={busy}
        disabled={address.trim() === ''}
        onPress={() => {
          void enroll();
        }}
      />
      {message === null ? null : (
        <Text selectable accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}
    </View>
  );
}
function EnrolledSensors(): ReactNode {
  const stream = usePluginStream(
    SHELLY_PRESENCE_PLUGIN_ID,
    SHELLY_PRESENCE_STREAM,
    SHELLY_PRESENCE_SNAPSHOT,
  );
  const [message, setMessage] = useState<string | null>(null);
  const forget = async (externalId: string): Promise<void> => {
    try {
      const reply = await callPluginTool(SHELLY_PRESENCE_PLUGIN_ID, 'forget', { externalId });
      SHELLY_PRESENCE_FORGET_RESULT.parse(reply.result);
      setMessage('Sensor removed from this plugin.');
    } catch (error) {
      setMessage(String(error));
    }
  };
  return (
    <View className="gap-3">
      {stream.state !== 'ready' ? null : (
        <List title="Connected sensors">
          {stream.value.devices.map((sensor) => (
            <View key={sensor.externalId} className="gap-2">
              <Text variant="body-strong">{sensor.name}</Text>
              <Text variant="footnote" tone="variant">
                {sensor.address}
              </Text>
              <Button
                label={`Forget ${sensor.name}`}
                variant="destructive"
                onPress={() => {
                  void forget(sensor.externalId);
                }}
              />
            </View>
          ))}
        </List>
      )}
      {message === null ? null : <Text>{message}</Text>}
    </View>
  );
}
export function EnrollmentSettings(): ReactNode {
  const owner = useIsOwner();
  const [address, setAddress] = useState('');
  const { candidates, busy, message, discover } = useDiscovery();
  if (!owner)
    return <Text tone="variant">The home owner can connect or forget configured sensors.</Text>;
  return (
    <View className="gap-section-gap">
      <Text variant="title-3">Connect Shelly Presence</Text>
      <Text tone="variant">
        First connect the sensor to Wi-Fi using the Shelly app. Add its local address here.
      </Text>
      <Button
        label="Discover configured Shelly sensors"
        variant="tonal"
        loading={busy}
        onPress={() => {
          void discover();
        }}
      />
      {message === null ? null : <Text>{message}</Text>}
      {candidates.length === 0 ? null : (
        <List title="Nearby configured sensors">
          {candidates.map((candidate) => (
            <NavRow
              key={candidate.address}
              title={candidate.name}
              subtitle={candidate.host}
              onPress={() => {
                setAddress(candidate.address);
              }}
            />
          ))}
        </List>
      )}
      <EnrollForm address={address} changeAddress={setAddress} />
      <EnrolledSensors />
    </View>
  );
}

function useEnroll(address: string): {
  readonly tls: EnrollmentTls;
  readonly setTls: (value: EnrollmentTls) => void;
  readonly password: string;
  readonly setPassword: (value: string) => void;
  readonly busy: boolean;
  readonly message: string | null;
  readonly enroll: () => Promise<void>;
} {
  const [password, setPassword] = useState('');
  const [tls, setTls] = useState<EnrollmentTls>({
    caPem: null,
    clientCertificate: null,
    clientKey: null,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const enroll = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const request = SHELLY_PRESENCE_ENROLL_REQUEST.parse({
        address,
        password: password === '' ? null : password,
        ...(address.startsWith('https://') ? { tls } : {}),
      });
      const reply = await callPluginTool(SHELLY_PRESENCE_PLUGIN_ID, 'enroll', request);
      const result = SHELLY_PRESENCE_ENROLL_RESULT.parse(reply.result);
      setPassword('');
      setTls({ caPem: null, clientCertificate: null, clientKey: null });
      setMessage(`${result.device.name} connected.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return { password, setPassword, tls, setTls, busy, message, enroll };
}

function useDiscovery(): {
  readonly candidates: ReturnType<typeof SHELLY_DISCOVERY_RESULT.parse>['candidates'];
  readonly busy: boolean;
  readonly message: string | null;
  readonly discover: () => Promise<void>;
} {
  const [candidates, setCandidates] = useState<
    ReturnType<typeof SHELLY_DISCOVERY_RESULT.parse>['candidates']
  >([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const discover = async (): Promise<void> => {
    setBusy(true);
    try {
      const reply = await callPluginTool(SHELLY_PRESENCE_PLUGIN_ID, 'discover', {});
      const result = SHELLY_DISCOVERY_RESULT.parse(reply.result);
      setCandidates(result.candidates);
      setMessage(
        result.reason ??
          (result.candidates.length === 0 ? 'No configured Shelly sensors found.' : null),
      );
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  return { candidates, busy, message, discover };
}
