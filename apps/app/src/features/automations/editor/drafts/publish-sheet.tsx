import type { ReactNode } from 'react';
import { View } from 'react-native';
import type {
  AutomationProgramComparison,
  AutomationProgramProblem,
} from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { LoadedQuery } from '../../../../components/loaded-query';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import type { PublishStage } from './use-publish-flow';
import { noteHeading, publishStatus } from './sync-copy';

type Review = Extract<PublishStage, { kind: 'review' | 'publishing' }>;

function NoteRow({
  problem,
  onGoTo,
}: {
  readonly problem: AutomationProgramProblem;
  readonly onGoTo: (nodeId: string) => void;
}): ReactNode {
  const nodeId = problem.nodeId;
  return (
    <View className="flex-row items-start gap-3 rounded-md bg-surface-2 px-3 py-2">
      <Icon name={problem.severity === 'warning' ? 'warning' : 'info'} size={20} tone="warning" />
      <Text variant="callout" className="min-w-0 flex-1">
        {problem.message}
      </Text>
      {nodeId === undefined ? null : (
        <Button
          label="Go to"
          variant="text"
          onPress={() => {
            onGoTo(nodeId);
          }}
        />
      )}
    </View>
  );
}

function Changes({
  current,
  query,
}: {
  readonly current: number;
  readonly query: UseQueryResult<AutomationProgramComparison>;
}): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="body-strong">{`Changed since version ${String(current)}`}</Text>
      <LoadedQuery query={query}>
        {(comparison) =>
          comparison.changes.length === 0 ? (
            <Text variant="callout" tone="variant">
              Nothing differs from the live version.
            </Text>
          ) : (
            comparison.changes.map((change) => (
              <View key={change.id} className="flex-row items-start gap-2">
                <Badge
                  label={{ added: 'Added', removed: 'Removed', changed: 'Changed' }[change.change]}
                  tone="neutral"
                />
                <Text variant="callout" className="min-w-0 flex-1">
                  {change.summary}
                </Text>
              </View>
            ))
          )
        }
      </LoadedQuery>
    </View>
  );
}

export interface PublishSheetProps {
  readonly stage: PublishStage;
  readonly changes: UseQueryResult<AutomationProgramComparison>;
  readonly onGoTo: (nodeId: string) => void;
  readonly onBack: () => void;
  readonly onPublish: () => void;
}

export function isReview(stage: PublishStage): stage is Review {
  return stage.kind === 'review' || stage.kind === 'publishing';
}

export function PublishSheet({
  stage,
  changes,
  onGoTo,
  onBack,
  onPublish,
}: PublishSheetProps): ReactNode {
  const plan = isReview(stage) ? stage.plan : null;
  const notes = plan?.notes ?? [];
  return (
    <Sheet
      open={plan !== null}
      onClose={onBack}
      title={plan === null ? 'Publish' : `Publish version ${String(plan.next)}`}
      footer={
        <View className="flex-row flex-wrap items-center justify-end gap-2">
          <Button label="Back to editing" variant="outlined" onPress={onBack} />
          <Button
            label={notes.length > 0 ? 'Publish anyway' : 'Publish'}
            variant="filled"
            loading={stage.kind === 'publishing'}
            onPress={onPublish}
          />
        </View>
      }
    >
      {plan === null ? null : (
        <View className="gap-4 px-4 pb-4">
          <View className="flex-row items-start gap-3">
            <Icon name="circleCheck" size={20} tone="positive" />
            <Text variant="body" className="min-w-0 flex-1">
              {publishStatus(plan.current, plan.next)}
            </Text>
          </View>
          {notes.length === 0 ? null : (
            <View className="gap-2">
              <Text variant="body-strong">{noteHeading(notes.length)}</Text>
              {notes.map((problem, at) => (
                <NoteRow key={`${problem.code}-${String(at)}`} problem={problem} onGoTo={onGoTo} />
              ))}
            </View>
          )}
          <Changes current={plan.current} query={changes} />
        </View>
      )}
    </Sheet>
  );
}
