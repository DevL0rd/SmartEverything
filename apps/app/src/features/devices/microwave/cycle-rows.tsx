import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DeviceLogEntry } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { readMinute } from '../../../store/clock';
import { CauseChip } from '../log/cause-chip';
import { cycleRow } from './cycles';

function CompactRow({ cycle }: { readonly cycle: DeviceLogEntry }): ReactNode {
  const row = cycleRow(cycle, readMinute());
  return (
    <View role="listitem" className="min-h-8 flex-row items-center gap-3">
      <Text variant="footnote" numberOfLines={1} className="min-w-0 flex-1">
        {row.what}
      </Text>
      <Text variant="caption" tone={row.finished ? 'variant' : 'faint'} className="tabular">
        {row.finished ? row.ended : `${row.ended} · Stopped`}
      </Text>
    </View>
  );
}

function FullRow({
  cycle,
  first,
  now,
}: {
  readonly cycle: DeviceLogEntry;
  readonly first: boolean;
  readonly now: number;
}): ReactNode {
  const row = cycleRow(cycle, now);
  return (
    <View
      role="listitem"
      className={cn(
        'flex-row items-center gap-3 py-2.5',
        first ? '' : 'border-t border-outline-variant',
      )}
    >
      <View className="min-w-0 flex-1 gap-px">
        <Text variant="callout" numberOfLines={2}>
          {row.what}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
          {row.when}
        </Text>
        <CauseChip cause={cycle.cause} />
      </View>
      <Badge
        label={row.finished ? 'Finished' : 'Stopped'}
        tone={row.finished ? 'positive' : 'neutral'}
      />
    </View>
  );
}

export function CycleRows({
  cycles,
  label,
  compact = false,
}: {
  readonly cycles: readonly DeviceLogEntry[];
  readonly label: string;
  readonly compact?: boolean;
}): ReactNode {
  const now = readMinute();
  return (
    <View role="list" aria-label={label}>
      {cycles.map((cycle, index) =>
        compact ? (
          <CompactRow key={cycle.at} cycle={cycle} />
        ) : (
          <FullRow key={cycle.at} cycle={cycle} first={index === 0} now={now} />
        ),
      )}
    </View>
  );
}
