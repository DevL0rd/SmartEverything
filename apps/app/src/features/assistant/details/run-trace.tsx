import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { ReasonLine } from '../../../components/reason-line';
import type { useAgentRun } from '../data/agent-runs';
import { useMoment } from './use-moment';

type Detail = NonNullable<ReturnType<typeof useAgentRun>['data']>;

export function RunTrace({
  detail,
  onNext,
}: {
  readonly detail: Detail;
  readonly onNext: (cursor: string) => void;
}): ReactNode {
  const when = useMoment();
  const next = detail.next_cursor;
  return (
    <>
      {detail.trace.length === 0 ? null : (
        <List title="Published activity">
          {detail.trace.map((entry) => (
            <ListRow
              key={entry.seq}
              title={`${entry.kind} · ${when(entry.created_at)}`}
              subtitle={entry.text}
              wrapSubtitle
            />
          ))}
        </List>
      )}
      {next === null ? null : (
        <View className="items-start px-4">
          <Button
            label="Next activity page"
            variant="text"
            onPress={() => {
              onNext(next);
            }}
          />
        </View>
      )}
      {detail.truncated ? (
        <View className="px-4">
          <ReasonLine icon="info" tone="warning" text="Published activity is truncated." />
        </View>
      ) : null}
    </>
  );
}
