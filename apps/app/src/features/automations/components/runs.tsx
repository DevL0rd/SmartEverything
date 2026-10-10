import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { EventRow } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { ValueRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { noticesDuring, tookText, type Run } from '../model/history';

export function RunRow({
  run,
  timeZone,
  onOpen,
}: {
  readonly run: Run;
  readonly timeZone: string | null;
  readonly onOpen: (run: Run) => void;
}): ReactNode {
  const now = useMinute();
  const failed = run.outcome === 'failed';
  return (
    <ListRow
      title={run.name}
      subtitle={joinParts([
        moment(run.at, now, timeZone),
        failed ? 'Failed' : tookText(run.durationMs),
      ])}
      subtitleTone={failed ? 'critical' : 'variant'}
      icon={failed ? 'circleX' : 'circleCheck'}
      iconTone={failed ? 'critical' : 'positive'}
      chevron
      onPress={() => {
        onOpen(run);
      }}
    />
  );
}

function RunDetails({
  run,
  events,
  timeZone,
}: {
  readonly run: Run;
  readonly events: readonly EventRow[];
  readonly timeZone: string | null;
}): ReactNode {
  const now = useMinute();
  const notices = noticesDuring(events, run);
  return (
    <View className="gap-section-gap">
      <List inset>
        <ValueRow title="Result" value={run.outcome === 'failed' ? 'Failed' : 'Done'} />
        <ValueRow title="Started" value={moment(run.at, now, timeZone)} />
        <ValueRow title="Took" value={tookText(run.durationMs)} />
      </List>
      {run.error === null ? null : (
        <List title="What went wrong" inset>
          <View className="px-4 py-3">
            <Text variant="body" tone="critical" selectable>
              {run.error}
            </Text>
          </View>
        </List>
      )}
      {notices.length === 0 ? null : (
        <List title="Notices sent" inset>
          {notices.map((notice, index) => (
            <ListRow key={`${String(index)}:${notice}`} title={notice} icon="bell" />
          ))}
        </List>
      )}
    </View>
  );
}

export interface RunSheet {
  readonly open: (run: Run) => void;
  readonly sheet: ReactNode;
}

export function useRunSheet(events: readonly EventRow[], timeZone: string | null): RunSheet {
  const [run, setRun] = useState<Run | null>(null);
  return {
    open: setRun,
    sheet: (
      <Sheet
        open={run !== null}
        title={run?.name ?? 'Run'}
        detents={['fit']}
        onClose={() => {
          setRun(null);
        }}
      >
        {run === null ? null : <RunDetails run={run} events={events} timeZone={timeZone} />}
      </Sheet>
    ),
  };
}
