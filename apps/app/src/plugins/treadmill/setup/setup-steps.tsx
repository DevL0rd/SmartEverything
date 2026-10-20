import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { SwitchTrack } from '../../../components/switch';
import { Text } from '../../../components/text';
import type { TreadmillCandidate } from '../../../../modules/health-connect';
import { CandidateRow } from './candidate-row';
import { sortedCandidates } from './setup-model';

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
        body="SmartEverything needs this to find the treadmill and to talk to it over Bluetooth. It does not use your location."
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

export function ScanStep({
  candidates,
  picked,
  onPick,
}: {
  readonly candidates: readonly TreadmillCandidate[];
  readonly picked: string | null;
  readonly onPick: (address: string) => void;
}): ReactNode {
  const found = sortedCandidates(candidates);
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Switch the treadmill on and stand near it. Close KS Fit on every phone first, or the
        treadmill stays hidden.
      </Text>
      {found.length === 0 ? (
        <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-4">
          <ActivityIndicator size="small" colorClassName="accent-primary" />
          <Text variant="callout" accessibilityLiveRegion="polite">
            Looking for treadmills…
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

export function CheckStep({
  closed,
  onToggle,
}: {
  readonly closed: boolean;
  readonly onToggle: (value: boolean) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        The treadmill talks to one phone at a time. If KS Fit is open anywhere, it keeps the link
        and the next step fails. The belt must be stopped with nobody on it: this step only reads
        from it and changes nothing.
      </Text>
      <List inset>
        <ListRow
          icon="smartphone"
          title="KS Fit is closed on every phone"
          subtitle="Swipe it away so it cannot reconnect"
          wrapSubtitle
          role="checkbox"
          checked={closed}
          onPress={() => {
            onToggle(!closed);
          }}
          trailing={<SwitchTrack value={closed} mixed={false} />}
        />
      </List>
    </View>
  );
}
