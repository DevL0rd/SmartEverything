import { useQueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
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
        'min-h-touch-min flex-row items-center gap-3 rounded-md border-hairline px-4 py-2',
        picked ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
    >
      <Icon name={candidate.secure ? 'lock' : 'printer'} tone="variant" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {candidate.name}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {candidate.known ? 'Already added' : (candidate.model ?? candidate.uri)}
          {candidate.location === null ? '' : ` · ${candidate.location}`}
        </Text>
      </View>
    </Interactive>
  );
}

function Searching(): ReactNode {
  return (
    <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-4">
      <ActivityIndicator size="small" colorClassName="accent-primary" />
      <Text variant="callout" accessibilityLiveRegion="polite">
        Looking for printers on your network…
      </Text>
    </View>
  );
}

function Rescan(): ReactNode {
  const actor = usePrinterActor(null);
  const client = useQueryClient();
  return (
    <View className="flex-row">
      <Button
        label="Look again"
        variant="tonal"
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
    <View className="gap-4">
      {searching ? <Searching /> : null}
      {found.length === 0 && !searching ? (
        <EmptyState
          compact
          icon="printer"
          title="No printers found"
          body="Make sure the printer is on and on the same network as the hub, or type its address below."
        />
      ) : (
        <View className="gap-2">
          {found.map((candidate) => (
            <CandidateRow
              key={candidate.uri}
              candidate={candidate}
              picked={candidate.uri === uri}
              onPick={() => {
                onPick(candidate);
              }}
            />
          ))}
        </View>
      )}
      <Rescan />
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
