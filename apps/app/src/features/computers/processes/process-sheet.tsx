import type { ReactNode } from 'react';
import { View } from 'react-native';
import { processKey } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { ErrorState } from '../../../components/error-state';
import { ReasonLine } from '../../../components/reason-line';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { bytes, decimal } from '../../../format/number';
import { plural } from '../../../format/text';
import { sameJson } from '../../../store/same-json';
import { WindowChart } from '../components/live-series-chart';
import { useComputerSelect } from '../data/computer-metrics';
import { useProcessDetail, useProcessPriority, type Priority } from '../data/computer-processes';
import { ProcessActions } from './process-actions';
import { ProcessFacts } from './process-facts';
import { belongsTo, PRIORITY_OPTIONS, priorityOf } from './process-sheet-model';
import { useProcessTrail } from './process-trail';

const TRAIL_MS = 120_000;
const PERCENT_DOMAIN = [0, 100] as const;

function Trail({
  deviceId,
  rowKey,
}: {
  readonly deviceId: string;
  readonly rowKey: string;
}): ReactNode {
  const trail = useProcessTrail(deviceId, rowKey);
  const top = Math.max(1, ...trail.memory.map((point) => point.v)) * 1.25;
  return (
    <View className="gap-2">
      <Text variant="label" tone="variant">
        LAST 2 MINUTES
      </Text>
      <WindowChart
        series={[{ label: 'CPU', colour: 'viz-1', points: trail.cpu }]}
        lists={[trail.cpu]}
        spanMs={TRAIL_MS}
        yDomain={PERCENT_DOMAIN}
        label="Process CPU"
        formatValue={(value) => `${decimal(value, 1)} %`}
        height={96}
        legend={false}
      />
      <WindowChart
        series={[{ label: 'Memory', colour: 'viz-1', points: trail.memory }]}
        lists={[trail.memory]}
        spanMs={TRAIL_MS}
        yDomain={[0, top]}
        label="Process memory"
        formatValue={bytes}
        height={96}
        legend={false}
      />
    </View>
  );
}

function PriorityRow({
  deviceId,
  pid,
  niceness,
  disabled,
}: {
  readonly deviceId: string;
  readonly pid: number;
  readonly niceness: number | null;
  readonly disabled: boolean;
}): ReactNode {
  const priority = useProcessPriority(deviceId);
  const shown: Priority = priority.isPending ? priority.variables.priority : priorityOf(niceness);
  return (
    <View className="gap-2">
      <Text variant="label" tone="variant">
        PRIORITY
      </Text>
      <Segmented
        label="Priority"
        value={shown}
        disabled={disabled}
        options={PRIORITY_OPTIONS}
        onChange={(next) => {
          priority.mutate({ pid, priority: next });
        }}
      />
      {shown === 'normal' ? null : (
        <Text variant="caption" tone="variant">
          Lower priority gives other programs the processor first. You can set it back.
        </Text>
      )}
    </View>
  );
}

function Facts({ detail }: { readonly detail: ReturnType<typeof useProcessDetail> }): ReactNode {
  if (detail.isError) {
    return (
      <ErrorState
        error={detail.error}
        retry={() => {
          background(detail.refetch(), 'computer_process.refetch_failed');
        }}
      />
    );
  }
  if (detail.data === undefined) return <Skeleton shape="block" />;
  return <ProcessFacts detail={detail.data} />;
}

function Body({
  deviceId,
  rowKey,
  offline,
  onClose,
}: {
  readonly deviceId: string;
  readonly rowKey: string;
  readonly offline: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const row = useComputerSelect(
    deviceId,
    (parts) => parts.processes?.rows.find((candidate) => processKey(candidate) === rowKey),
    sameJson,
  );
  const detail = useProcessDetail(deviceId, row?.pid ?? null);
  if (row === undefined) {
    return <ReasonLine icon="info" text="This program has ended." />;
  }
  return (
    <View className="gap-4 px-4 pb-6">
      <ProcessActions
        deviceId={deviceId}
        row={row}
        disabled={!row.own || offline}
        onGone={onClose}
      />
      {row.own ? null : <ReasonLine icon="lock" text={belongsTo(row.user)} />}
      <Trail deviceId={deviceId} rowKey={rowKey} />
      <PriorityRow
        deviceId={deviceId}
        pid={row.pid}
        niceness={detail.data?.niceness ?? null}
        disabled={!row.own || offline}
      />
      <Facts detail={detail} />
    </View>
  );
}

export function ProcessSheet({
  deviceId,
  rowKey,
  name,
  helpers,
  offline,
  onClose,
}: {
  readonly deviceId: string;
  readonly rowKey: string | null;
  readonly name: string;
  readonly helpers: number;
  readonly offline: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet
      open={rowKey !== null}
      onClose={onClose}
      title={helpers > 0 ? `${name} · ${plural(helpers, 'helper')} included` : name}
      detents={['half', 'full']}
    >
      {rowKey === null ? null : (
        <Body deviceId={deviceId} rowKey={rowKey} offline={offline} onClose={onClose} />
      )}
    </Sheet>
  );
}
