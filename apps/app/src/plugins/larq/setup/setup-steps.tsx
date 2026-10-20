import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { BottleCandidate } from '../../../../modules/health-connect';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { SignalBars } from '../../../components/signal-bars';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { READ_LINE, signalWord, sortedCandidates } from './setup-model';
import type { ReadStatus } from './use-setup';

export function PermissionStep({
  denied,
  onAllow,
}: {
  readonly denied: boolean;
  readonly onAllow: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <EmptyState
        icon="bluetooth"
        title="Allow nearby devices"
        body="SmartEverything needs this to find the bottle and read it over Bluetooth. It does not use your location."
      />
      {denied ? (
        <Banner
          tone="warning"
          title="Nearby devices is turned off"
          body="Allow it in the app settings, then come back."
          wrapBody
          action={{
            label: 'Open settings',
            onPress: (): void => {
              background(Linking.openSettings(), 'settings.open_failed');
            },
          }}
        />
      ) : null}
      <Button label="Allow nearby devices" size="lg" onPress={onAllow} />
    </View>
  );
}

function CandidateRow({
  candidate,
  picked,
  onPick,
}: {
  readonly candidate: BottleCandidate;
  readonly picked: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      selected={picked}
      label={`${candidate.name}, ${signalWord(candidate.rssi)} signal`}
      onPress={onPick}
      className={cn(
        'min-h-touch-min flex-row items-center gap-3 rounded-md border-hairline px-4 py-2',
        picked ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
    >
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {candidate.name}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1} className="tabular">
          {`Bottle …${candidate.serial.slice(-4)}`}
        </Text>
      </View>
      <View className="w-20 shrink-0 items-end gap-0.5">
        <SignalBars dbm={candidate.rssi} />
        <Text
          variant="caption"
          tone="variant"
          className="tabular"
        >{`${String(candidate.rssi)} dBm`}</Text>
      </View>
      <View className="size-6 shrink-0 items-center justify-center">
        {picked ? <Icon name="check" size={20} tone="primary" /> : null}
      </View>
    </Interactive>
  );
}

export function FindStep({
  candidates,
  picked,
  onPick,
}: {
  readonly candidates: readonly BottleCandidate[];
  readonly picked: string | null;
  readonly onPick: (address: string) => void;
}): ReactNode {
  const found = sortedCandidates(candidates);
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Tap the cap, or put it on the charger, to wake it. It only shows up while it is awake.
      </Text>
      {found.length === 0 ? (
        <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-4">
          <ActivityIndicator size="small" colorClassName="accent-primary" />
          <Text variant="callout" accessibilityLiveRegion="polite">
            Looking for bottles…
          </Text>
        </View>
      ) : (
        <View className="gap-2" accessibilityRole="radiogroup">
          {found.map((candidate) => (
            <CandidateRow
              key={candidate.address}
              candidate={candidate}
              picked={picked === candidate.address}
              onPick={() => {
                onPick(candidate.address);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function ReadStep({
  status,
  onRead,
}: {
  readonly status: ReadStatus;
  readonly onRead: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        {READ_LINE}
      </Text>
      {status.kind === 'reading' ? (
        <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-4">
          <ActivityIndicator size="small" colorClassName="accent-primary" />
          <Text variant="callout" accessibilityLiveRegion="polite">
            Reading the bottle…
          </Text>
        </View>
      ) : null}
      {status.kind === 'failed' ? (
        <Banner
          tone="critical"
          title="The bottle did not answer"
          body={`${status.reason} Tap the cap to wake it and try again.`}
          wrapBody
        />
      ) : null}
      {status.kind === 'done' ? (
        <Banner
          tone="positive"
          title="Read the bottle"
          body="Its model and battery are noted."
          wrapBody
        />
      ) : null}
      {status.kind === 'done' ? null : (
        <Button
          label={status.kind === 'failed' ? 'Try again' : 'Read the bottle'}
          size="lg"
          loading={status.kind === 'reading'}
          onPress={onRead}
        />
      )}
    </View>
  );
}
