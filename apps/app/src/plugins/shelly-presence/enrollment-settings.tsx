import { Logger, background } from '@smarteverything/logging';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  SHELLY_DISCOVERY_RESULT,
  SHELLY_ENROLL_REQUEST,
  SHELLY_ENROLL_RESULT,
  SHELLY_FORGET_RESULT,
  SHELLY_PLUGIN_ID,
  SHELLY_SNAPSHOT,
  SHELLY_SNAPSHOT_STREAM,
} from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { callPluginTool } from '../../api/plugins';
import { useIsOwner } from '../../store/selectors';
import { PluginButton } from '../shared/plugin-action';
import { usePluginStream } from '../shared/use-plugin-stream';
import { failure } from './use-presence-operation';

const log = new Logger('app.shelly-presence');
function EnrolledSensors(): ReactNode {
  const stream = usePluginStream(SHELLY_PLUGIN_ID, SHELLY_SNAPSHOT_STREAM, SHELLY_SNAPSHOT);
  const [message, setMessage] = useState<string | null>(null);
  const forget = async (externalId: string): Promise<void> => {
    try {
      const reply = await callPluginTool(SHELLY_PLUGIN_ID, 'forget', { externalId });
      SHELLY_FORGET_RESULT.parse(reply.result);
      log.info('sensor.forgotten', { externalId });
      setMessage('Sensor removed from this plugin.');
    } catch (error) {
      log.warn('sensor.forget_failed', {
        externalId,
        error: error instanceof Error ? error.name : typeof error,
      });
      setMessage(failure(error));
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
              <PluginButton
                label={`Forget ${sensor.name}`}
                variant="destructive"
                confirmation={{
                  title: `Forget ${sensor.name}?`,
                  body: 'The sensor and its zones leave SmartEverything. The physical sensor is not reset.',
                  confirmLabel: 'Forget',
                  tone: 'destructive',
                }}
                onPress={() => forget(sensor.externalId)}
              />
            </View>
          ))}
        </List>
      )}
      {message === null ? null : <Text>{message}</Text>}
    </View>
  );
}
type Candidate = ReturnType<typeof SHELLY_DISCOVERY_RESULT.parse>['candidates'][number];

export function unpairedCandidates(
  candidates: readonly Candidate[],
  paired: readonly { readonly address: string; readonly info: { readonly id: string } }[],
): Candidate[] {
  const byName = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = candidate.name.toLowerCase();
    const known = byName.get(key);
    if (known === undefined || known.address.includes('[')) byName.set(key, candidate);
  }
  return [...byName.values()].filter(
    (candidate) =>
      !paired.some(
        (sensor) =>
          sensor.address === candidate.address ||
          sensor.info.id.toLowerCase() === candidate.name.toLowerCase(),
      ),
  );
}

function NearbySensors({ candidates }: { readonly candidates: readonly Candidate[] }): ReactNode {
  const { password, setPassword, pairing, report, pair } = usePairing();
  return (
    <View className="gap-3">
      <TextField
        label="Local access password"
        kind="password"
        value={password}
        onChange={setPassword}
        helper="Leave blank if local authentication is disabled"
      />
      {candidates.length === 0 ? null : (
        <List title="Nearby sensors">
          {candidates.map((candidate) => (
            <NavRow
              key={candidate.address}
              title={candidate.name}
              subtitle={candidate.host}
              onPress={() => {
                background(pair([candidate]), 'enrollment_settings.pair_failed');
              }}
            />
          ))}
        </List>
      )}
      {candidates.length < 2 ? null : (
        <Button
          label={`Pair all (${String(candidates.length)})`}
          loading={pairing}
          onPress={() => {
            background(pair(candidates), 'enrollment_settings.pair_failed');
          }}
        />
      )}
      {report === null ? null : (
        <Text selectable accessibilityLiveRegion="polite">
          {report}
        </Text>
      )}
    </View>
  );
}

export function EnrollmentSettings(): ReactNode {
  const owner = useIsOwner();
  const stream = usePluginStream(SHELLY_PLUGIN_ID, SHELLY_SNAPSHOT_STREAM, SHELLY_SNAPSHOT);
  const { candidates, busy, message, discover } = useDiscovery();
  useEffect(() => {
    if (owner) background(discover(), 'enrollment_settings.discover_failed');
  }, [owner, discover]);
  if (!owner)
    return <Text tone="variant">The home owner can connect or forget configured sensors.</Text>;
  const paired = stream.state === 'ready' ? stream.value.devices : [];
  return (
    <View className="gap-section-gap">
      <Text variant="title-3">Connect Shelly Presence</Text>
      <Text tone="variant">
        First connect the sensor to Wi-Fi using the Shelly app. Sensors on your network show up
        here.
      </Text>
      <Button
        label="Search again"
        variant="tonal"
        loading={busy}
        onPress={() => {
          background(discover(), 'enrollment_settings.discover_failed');
        }}
      />
      {message === null ? null : <Text>{message}</Text>}
      <NearbySensors candidates={unpairedCandidates(candidates, paired)} />
      <EnrolledSensors />
    </View>
  );
}

function usePairing(): {
  readonly password: string;
  readonly setPassword: (value: string) => void;
  readonly pairing: boolean;
  readonly report: string | null;
  readonly pair: (list: readonly Candidate[]) => Promise<void>;
} {
  const [password, setPassword] = useState('');
  const [pairing, setPairing] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const pair = async (list: readonly Candidate[]): Promise<void> => {
    setPairing(true);
    setReport(null);
    const lines: string[] = [];
    for (const candidate of list) {
      try {
        const request = SHELLY_ENROLL_REQUEST.parse({
          address: candidate.address,
          password: password === '' ? null : password,
        });
        const reply = await callPluginTool(SHELLY_PLUGIN_ID, 'enroll', request);
        lines.push(`${SHELLY_ENROLL_RESULT.parse(reply.result).device.name} connected.`);
        log.info('sensor.enrolled', { candidates: list.length });
      } catch (error) {
        log.warn('sensor.enroll_failed', {
          error: error instanceof Error ? error.name : typeof error,
          hasPassword: password !== '',
        });
        lines.push(`${candidate.name}: ${failure(error)}`);
      }
    }
    setReport(lines.join('\n'));
    setPairing(false);
  };
  return { password, setPassword, pairing, report, pair };
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
  const discover = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const reply = await callPluginTool(SHELLY_PLUGIN_ID, 'discover', {});
      const result = SHELLY_DISCOVERY_RESULT.parse(reply.result);
      log.info('sensor.discovered', { candidates: result.candidates.length });
      setCandidates(result.candidates);
      setMessage(
        result.reason ??
          (result.candidates.length === 0 ? 'No configured Shelly sensors found.' : null),
      );
    } catch (error) {
      log.warn('sensor.discover_failed', {
        error: error instanceof Error ? error.name : typeof error,
      });
      setMessage(failure(error));
    } finally {
      setBusy(false);
    }
  }, []);
  return { candidates, busy, message, discover };
}
