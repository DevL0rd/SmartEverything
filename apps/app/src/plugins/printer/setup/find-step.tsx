import { useQueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { cn } from '../../../design/cn';
import { CANDIDATES_KEY, useCandidates } from '../data/use-candidates';
import type { ViewOf } from '../data/printer-api';
import { usePrinterActor } from '../data/use-printer-view';

type Candidate = ViewOf<'candidates'>['candidates'][number];

function CandidateRow({
  candidate,
  picked,
  onPick,
}: {
  readonly candidate: Candidate;
  readonly picked: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      selected={picked}
      disabled={candidate.known}
      label={`${candidate.name}${candidate.known ? ', already added' : ''}`}
      onPress={onPick}
      className={cn(
        'min-h-touch-min flex-row items-center gap-2 rounded-md border-hairline px-3 py-1.5',
        picked ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
    >
      <Icon name={candidate.secure ? 'lock' : 'printer'} tone="variant" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" className="web:wrap-anywhere">
          {candidate.name}
        </Text>
        <Text variant="caption" tone="variant" className="web:wrap-anywhere">
          {candidate.known ? 'Already added' : (candidate.model ?? candidate.uri)}
          {candidate.location === null ? '' : ` · ${candidate.location}`}
        </Text>
      </View>
    </Interactive>
  );
}

function Searching(): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <ActivityIndicator size="small" colorClassName="accent-primary" />
      <Text variant="callout" accessibilityLiveRegion="polite" className="flex-1">
        Looking for printers on your network…
      </Text>
    </View>
  );
}

function Rescan(): ReactNode {
  const actor = usePrinterActor(null);
  const client = useQueryClient();
  return (
    <Button
      label="Look again"
      variant="text"
      icon="refresh"
      onPress={() => {
        background(
          actor
            .throwing({ action: 'rescan' })
            .then(() => client.invalidateQueries({ queryKey: CANDIDATES_KEY })),
          'printer.rescan_failed',
        );
      }}
    />
  );
}

function DiscoveryHeading({
  searching,
  empty,
}: {
  readonly searching: boolean;
  readonly empty: boolean;
}): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-2">
      {searching ? (
        <Searching />
      ) : (
        <Text variant="body-strong" accessibilityRole="header" className="min-w-0 flex-1">
          {empty ? 'No printers found' : 'Nearby printers'}
        </Text>
      )}
      <Rescan />
    </View>
  );
}

export function FindStep({
  uri,
  onUri,
  onPick,
}: {
  readonly uri: string;
  readonly onUri: (uri: string) => void;
  readonly onPick: (candidate: Candidate) => void;
}): ReactNode {
  const candidates = useCandidates();
  const found = candidates.data?.candidates ?? [];
  const searching = candidates.data?.searching === true;
  return (
    <View className="gap-3">
      <View className="gap-1">
        <DiscoveryHeading searching={searching} empty={found.length === 0} />
        {found.length === 0 && !searching ? (
          <Text variant="callout" tone="variant">
            Make sure the printer is on and on the same network as the hub, or type its address
            below.
          </Text>
        ) : (
          found.map((candidate) => (
            <CandidateRow
              key={candidate.uri}
              candidate={candidate}
              picked={candidate.uri === uri}
              onPick={() => {
                onPick(candidate);
              }}
            />
          ))
        )}
      </View>
      <TextField
        label="Or type the printer address"
        value={uri}
        onChange={onUri}
        kind="url"
        placeholder="ipp://192.168.1.20/ipp/print"
        helper="An address that starts with ipp:// or ipps://, or just the printer's IP address."
      />
    </View>
  );
}
