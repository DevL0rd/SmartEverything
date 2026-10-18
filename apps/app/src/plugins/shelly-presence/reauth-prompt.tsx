import { Logger } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { SHELLY_ENROLL_RESULT, SHELLY_PLUGIN_ID, type ShellyDevice } from '@smarteverything/shelly';
import { callPluginTool } from '../../api/plugins';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Text } from '../../components/text';
import { TextField } from '../../components/text-field';
import { useIsOwner } from '../../store/selectors';
import { failure } from './use-presence-operation';

const log = new Logger('app.shelly-presence');
export function needsPassword(sensor: ShellyDevice, owner: boolean): boolean {
  return owner && sensor.connection.state === 'needs_auth';
}

export function ReauthPrompt({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const owner = useIsOwner();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!needsPassword(sensor, owner)) return null;
  const connect = (): void => {
    setBusy(true);
    setError(null);
    callPluginTool(SHELLY_PLUGIN_ID, 'enroll', { address: sensor.address, password })
      .then((reply) => {
        SHELLY_ENROLL_RESULT.parse(reply.result);
        log.info('sensor.reauthenticated', { externalId: sensor.externalId });
        setPassword('');
      })
      .catch((caught: unknown) => {
        log.warn('sensor.reauth_failed', {
          externalId: sensor.externalId,
          error: caught instanceof Error ? caught.name : typeof caught,
        });
        setError(failure(caught));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <Card title="Enter password" tone="attention">
      <View className="gap-3">
        <Text tone="variant">This sensor needs its local access password.</Text>
        <TextField
          label="Local access password"
          kind="password"
          value={password}
          onChange={setPassword}
        />
        {error === null ? null : <Text tone="critical">{error}</Text>}
        <Button label="Connect" loading={busy} disabled={password === ''} onPress={connect} />
      </View>
    </Card>
  );
}
