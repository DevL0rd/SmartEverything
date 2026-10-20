import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationProgramChange } from '@smarteverything/domain';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { LoadedQuery } from '../../../../components/loaded-query';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { useMinute } from '../../../../store/clock';
import type { TheirRevision } from './draft-sync-model';
import { compareCaption, compareHeads } from './sync-copy';
import type { Comparisons } from './use-draft-sync';

const LABEL: Readonly<Record<AutomationProgramChange['change'], string>> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
};

function ChangeRow({
  change,
  onShow,
}: {
  readonly change: AutomationProgramChange;
  readonly onShow: (id: string) => void;
}): ReactNode {
  return (
    <View className="gap-1 rounded-md bg-surface-2 px-3 py-2">
      <View className="flex-row items-start gap-2">
        <Badge
          label={LABEL[change.change]}
          tone={change.change === 'removed' ? 'warning' : 'neutral'}
        />
        <Text variant="callout" className="min-w-0 flex-1">
          {change.summary}
        </Text>
      </View>
      {change.change === 'removed' ? null : (
        <Button
          label="Show on canvas"
          variant="text"
          onPress={() => {
            onShow(change.id);
          }}
        />
      )}
    </View>
  );
}

function Column({
  heading,
  query,
  onShow,
}: {
  readonly heading: string;
  readonly query: Comparisons['mine'];
  readonly onShow: (id: string) => void;
}): ReactNode {
  return (
    <View className="min-w-64 flex-1 gap-2">
      <Text variant="body-strong">{heading}</Text>
      <LoadedQuery query={query}>
        {(comparison) =>
          comparison.changes.length === 0 ? (
            <Text variant="callout" tone="variant">
              No differences.
            </Text>
          ) : (
            <View className="gap-2">
              {comparison.changes.map((change) => (
                <ChangeRow key={change.id} change={change} onShow={onShow} />
              ))}
            </View>
          )
        }
      </LoadedQuery>
    </View>
  );
}

export interface CompareSheetProps {
  readonly open: boolean;
  readonly baseRevision: number;
  readonly conflict: TheirRevision;
  readonly by: string;
  readonly timeZone: string | null;
  readonly comparisons: Comparisons;
  readonly onShow: (id: string) => void;
  readonly onKeepMine: () => void;
  readonly onUseTheirs: () => void;
  readonly onClose: () => void;
}

export function CompareSheet({
  open,
  baseRevision,
  conflict,
  by,
  timeZone,
  comparisons,
  onShow,
  onKeepMine,
  onUseTheirs,
  onClose,
}: CompareSheetProps): ReactNode {
  const now = useMinute();
  const heads = compareHeads({
    base: baseRevision,
    by,
    theirs: conflict.revision,
    savedAt: conflict.savedAt,
    now,
    zone: timeZone,
  });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Compare changes"
      wide
      footer={
        <View className="gap-2">
          <Text variant="footnote" tone="variant">
            {compareCaption(conflict.revision)}
          </Text>
          <View className="flex-row flex-wrap items-center justify-end gap-2">
            <Button label="Use theirs" variant="outlined" onPress={onUseTheirs} />
            <Button label="Keep my draft" variant="filled" onPress={onKeepMine} />
          </View>
        </View>
      }
    >
      <View className="flex-row flex-wrap gap-4 px-4 pb-4">
        <Column heading={heads.mine} query={comparisons.mine} onShow={onShow} />
        <Column heading={heads.theirs} query={comparisons.theirs} onShow={onShow} />
      </View>
    </Sheet>
  );
}
