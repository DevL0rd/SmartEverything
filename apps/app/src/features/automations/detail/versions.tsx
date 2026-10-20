import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationProgramChange } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { moment } from '../../../format/time';
import type { VersionRow } from './detail-model';
import { useComparison } from './use-detail-data';

const SHOWN = 5;

const CHANGE_LABEL: Readonly<Record<AutomationProgramChange['change'], string>> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
};

function Changes({
  automationId,
  revision,
  live,
}: {
  readonly automationId: string;
  readonly revision: number;
  readonly live: number;
}): ReactNode {
  const query = useComparison(automationId, revision, live, true);
  return (
    <LoadedQuery query={query}>
      {(comparison) =>
        comparison.changes.length === 0 ? (
          <Text variant="footnote" tone="variant">
            Nothing differs from the live version.
          </Text>
        ) : (
          <View className="gap-2">
            <Text variant="footnote" tone="variant">
              {`What changed from version ${String(revision)} to version ${String(live)}`}
            </Text>
            {comparison.changes.map((change) => (
              <View key={change.id} className="flex-row items-start gap-2">
                <Badge
                  label={CHANGE_LABEL[change.change]}
                  tone={change.change === 'removed' ? 'warning' : 'neutral'}
                />
                <Text variant="callout" className="min-w-0 flex-1">
                  {change.summary}
                </Text>
              </View>
            ))}
          </View>
        )
      }
    </LoadedQuery>
  );
}

interface RowProps {
  readonly automationId: string;
  readonly version: VersionRow;
  readonly live: number;
  readonly timeZone: string | null;
  readonly comparing: boolean;
  readonly onCompare: (revision: number) => void;
  readonly onRestore: (revision: number) => void;
}

function Version({
  automationId,
  version,
  live,
  timeZone,
  comparing,
  onCompare,
  onRestore,
}: RowProps): ReactNode {
  const now = useMinute();
  return (
    <View className="gap-2 rounded-md bg-surface-2 px-4 py-3">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <View className="min-w-48 flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text variant="body-strong">{`Version ${String(version.revision)}`}</Text>
            {version.live ? <Badge label="Live" tone="positive" /> : null}
          </View>
          <Text variant="footnote" tone="variant">
            {`${version.by} · ${moment(version.savedAt, now, timeZone)}`}
          </Text>
        </View>
        {version.live ? null : (
          <View className="flex-row items-center gap-2">
            <Button
              label={comparing ? 'Hide changes' : 'Compare'}
              variant="text"
              onPress={() => {
                onCompare(version.revision);
              }}
            />
            <Button
              label="Restore as draft"
              variant="tonal"
              icon="undo"
              onPress={() => {
                onRestore(version.revision);
              }}
            />
          </View>
        )}
      </View>
      {comparing ? (
        <Changes automationId={automationId} revision={version.revision} live={live} />
      ) : null}
    </View>
  );
}

export interface VersionsProps {
  readonly automationId: string;
  readonly versions: readonly VersionRow[];
  readonly live: number;
  readonly timeZone: string | null;
  readonly showAll: boolean;
  readonly onShowAll: (all: boolean) => void;
  readonly onRestore: (revision: number) => void;
}

export function Versions({
  automationId,
  versions,
  live,
  timeZone,
  showAll,
  onShowAll,
  onRestore,
}: VersionsProps): ReactNode {
  const [comparing, setComparing] = useState<number | null>(null);
  const shown = showAll ? versions : versions.slice(0, SHOWN);
  return (
    <Card title="Versions" icon="clock">
      {versions.length === 0 ? (
        <Text variant="body" tone="variant">
          No versions yet.
        </Text>
      ) : (
        shown.map((version) => (
          <Version
            key={version.revision}
            automationId={automationId}
            version={version}
            live={live}
            timeZone={timeZone}
            comparing={comparing === version.revision}
            onCompare={(revision) => {
              setComparing(comparing === revision ? null : revision);
            }}
            onRestore={onRestore}
          />
        ))
      )}
      {versions.length > SHOWN ? (
        <Button
          label={showAll ? 'Show fewer' : `Show all ${String(versions.length)}`}
          variant="text"
          onPress={() => {
            onShowAll(!showAll);
          }}
        />
      ) : null}
    </Card>
  );
}
