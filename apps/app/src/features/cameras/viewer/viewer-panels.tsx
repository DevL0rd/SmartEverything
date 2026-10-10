import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { presentCapability, type PresentedCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { HScroller } from '../../../components/h-scroller';
import { Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { useLedger } from '../../../store/store-context';
import { RecentEvents } from '../components/recent-events';
import { presetsOf, type CameraEntry } from '../logic/cameras';
import type { Viewer } from './use-viewer';

export function PresetsRow({ viewer }: { readonly viewer: Viewer }): ReactNode {
  const ledger = useLedger();
  const presets = presetsOf(viewer.entry);
  if (!viewer.ptz.supported && presets.length === 0) {
    return null;
  }
  return (
    <Section title="Positions">
      <HScroller label="Camera positions">
        <View className="flex-row gap-2 px-1">
          {viewer.ptz.supported ? (
            <Button
              label="Home"
              icon="home"
              variant="tonal"
              onPress={() => {
                viewer.ptz.step('home');
              }}
            />
          ) : null}
          {presets.map((preset) => (
            <Button
              key={preset}
              label={preset}
              variant="tonal"
              onPress={() => {
                void ledger.send(viewer.entry.device, 'ptz_preset', preset);
              }}
            />
          ))}
        </View>
      </HScroller>
    </Section>
  );
}

function capabilityOf(entry: CameraEntry, key: string): PresentedCapability | null {
  const capability = entry.device.capabilities.find((candidate) => candidate.key === key);
  if (capability === undefined) {
    return null;
  }
  const presented = { ...presentCapability(entry.device, capability), capability };
  return presented.writable ? presented : null;
}

export function InCallBar({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const router = useRouter();
  const ledger = useLedger();
  const hangUp = capabilityOf(entry, 'call_hang_up');
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row flex-wrap items-center gap-3 rounded-lg bg-primary-container px-4 py-3"
    >
      <Text variant="body-strong" tone="primary" className="min-w-40 flex-1">
        {`In a call with ${entry.name}`}
      </Text>
      <Button
        label="End call"
        icon="phoneOff"
        variant="destructive"
        onPress={() => {
          if (hangUp !== null) {
            void ledger.send(entry.device, hangUp.key, null);
          }
          router.setParams({ call: undefined });
        }}
      />
    </View>
  );
}

export function useAnswering(): boolean {
  return useLocalSearchParams<{ call?: string }>().call === '1';
}

export function RecentForCamera({ entry }: { readonly entry: CameraEntry }): ReactNode {
  return <RecentEvents cameras={[entry]} limit={6} title="Recent events" />;
}
