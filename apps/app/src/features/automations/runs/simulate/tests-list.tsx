import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { confirm } from '../../../../components/confirm-store';
import { EmptyState } from '../../../../components/empty-state';
import { IconButton } from '../../../../components/icon-button';
import { notifyFailure } from '../../../../components/toast-store';
import { Text } from '../../../../components/text';
import { useRunActions, useStoredTests } from '../../data/use-runs';
import { resultsSummary, testRows, type TestRowModel, type TestStatus } from './scenario-model';
import { useRunAll } from './use-run-all';

const STATUS_BADGE: Readonly<
  Record<
    TestStatus,
    {
      readonly label: string;
      readonly tone: 'neutral' | 'positive' | 'critical';
      readonly icon: 'circleCheck' | 'circleX' | 'clock';
    }
  >
> = {
  pending: { label: 'Not run yet', tone: 'neutral', icon: 'clock' },
  passed: { label: 'Passed', tone: 'positive', icon: 'circleCheck' },
  failed: { label: 'Failed', tone: 'critical', icon: 'circleX' },
};

export interface TestsListProps {
  readonly rows: readonly TestRowModel[];
  readonly summary: string;
  readonly running: boolean;
  readonly onRunAll: () => void;
  readonly onRemove: (row: TestRowModel) => void;
}

function TestRow({
  row,
  onRemove,
}: {
  readonly row: TestRowModel;
  readonly onRemove: () => void;
}): ReactNode {
  const badge = STATUS_BADGE[row.status];
  return (
    <View className="flex-row items-start gap-2 rounded-md bg-surface-2 p-3">
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="body-strong">{row.name}</Text>
          <Badge label={badge.label} tone={badge.tone} icon={badge.icon} />
        </View>
        {row.checks.map((check) => (
          <Text key={check} variant="footnote" tone="variant">
            {check}
          </Text>
        ))}
        {row.failures.map((failure) => (
          <Text key={failure} variant="footnote" tone="critical">
            {failure}
          </Text>
        ))}
      </View>
      <IconButton icon="trash" label={`Delete ${row.name}`} onPress={onRemove} />
    </View>
  );
}

export function TestsList({
  rows,
  summary,
  running,
  onRunAll,
  onRemove,
}: TestsListProps): ReactNode {
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon="plan"
        title="No tests yet"
        body="Simulate a scenario and keep it as a test to check this automation later."
      />
    );
  }
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">Tests</Text>
          <Text variant="footnote" tone="variant">
            {summary}
          </Text>
        </View>
        <Button label="Run all" icon="play" variant="tonal" loading={running} onPress={onRunAll} />
      </View>
      {rows.map((row) => (
        <TestRow
          key={row.id}
          row={row}
          onRemove={() => {
            onRemove(row);
          }}
        />
      ))}
    </View>
  );
}

export function AutomationTests({ automationId }: { readonly automationId: string }): ReactNode {
  const tests = useStoredTests(automationId);
  const actions = useRunActions();
  const all = useRunAll(automationId);
  const stored = tests.data ?? [];
  return (
    <TestsList
      rows={testRows(stored, all.reply)}
      summary={resultsSummary(stored.length, all.reply)}
      running={all.running}
      onRunAll={all.runAll}
      onRemove={(row) => {
        background(
          (async (): Promise<void> => {
            const accepted = await confirm({
              title: `Delete ${row.name}?`,
              body: 'The saved test is removed. The automation is not changed.',
              confirmLabel: 'Delete',
              tone: 'destructive',
            });
            if (accepted) await actions.removeTest(automationId, row.id);
          })().catch(notifyFailure('The test was not deleted.')),
          'automations.test_remove',
          { automationId, testId: row.id },
        );
      }}
    />
  );
}
