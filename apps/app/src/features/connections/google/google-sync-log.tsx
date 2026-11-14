import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { GoogleChoice, GoogleSyncLogEntry } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Section } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { STATUS_FILL } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { clock, dayLabel } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useChooseTask } from './google-actions';
import { logLine, openChoice } from './google-log';

function Choices({
  entry,
  choice,
  personId,
}: {
  readonly entry: GoogleSyncLogEntry;
  readonly choice: GoogleChoice;
  readonly personId: string;
}): ReactNode {
  const choose = useChooseTask(personId);
  return (
    <View className="flex-row flex-wrap gap-2 pl-14">
      {choice.candidates.map((candidate) => (
        <Button
          key={candidate.google_id}
          label={`Keep ${candidate.title === '' ? 'untitled' : candidate.title} · ${clock(candidate.created_at)}`}
          hint={`Keeps the task made at ${clock(candidate.created_at)} and removes the others`}
          variant="outlined"
          onPress={() => {
            choose(entry.id, candidate.google_id);
          }}
        />
      ))}
    </View>
  );
}

function LogRow({
  entry,
  personId,
  now,
}: {
  readonly entry: GoogleSyncLogEntry;
  readonly personId: string;
  readonly now: number;
}): ReactNode {
  const line = logLine(entry);
  const day = dayLabel(entry.at, now);
  const caption = day === 'Today' ? line.caption : `${day} · ${line.caption}`;
  return (
    <View className="gap-2">
      <View className="flex-row items-start gap-3">
        <Text variant="footnote" tone="variant" className="w-11 pt-0.5 font-mono tabular">
          {clock(entry.at)}
        </Text>
        <View className={cn('mt-1.5 size-2 rounded-full', STATUS_FILL[line.tone])} />
        <View className="min-w-0 flex-1">
          <Text variant="callout">{line.text}</Text>
          <Text variant="footnote" tone="variant">
            {caption}
          </Text>
        </View>
      </View>
      {entry.choice !== null && openChoice(entry) ? (
        <Choices entry={entry} choice={entry.choice} personId={personId} />
      ) : null}
    </View>
  );
}

function LogBody({
  entries,
  personId,
}: {
  readonly entries: readonly GoogleSyncLogEntry[] | undefined;
  readonly personId: string;
}): ReactNode {
  const now = useMinute();
  if (entries === undefined) {
    return <Skeleton className="h-16 w-full rounded-md" />;
  }
  if (entries.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        No syncs yet. The first one runs right after linking.
      </Text>
    );
  }
  return entries.map((entry) => (
    <LogRow key={entry.id} entry={entry} personId={personId} now={now} />
  ));
}

export function GoogleSyncLog({
  entries,
  failed,
  personId,
}: {
  readonly entries: readonly GoogleSyncLogEntry[] | undefined;
  readonly failed: boolean;
  readonly personId: string;
}): ReactNode {
  return (
    <Section title="Sync log">
      <Card>
        {failed ? (
          <Text variant="callout" tone="critical">
            The sync log didn’t load.
          </Text>
        ) : (
          <LogBody entries={entries} personId={personId} />
        )}
      </Card>
    </Section>
  );
}
