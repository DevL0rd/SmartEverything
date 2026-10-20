import type { TreadmillSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useDayKey } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { BeltStrip } from '../components/belt-strip';
import { PersonChip } from '../components/person-chip';
import { SessionDetailView } from '../components/session-detail';
import { SessionRow } from '../components/session-row';
import { useTreadmillView } from '../data/treadmill-data';
import { groupSessions } from '../model/session-model';

const PAGE = 20;
const MAX_PAGE = 200;

function canShowMore(more: boolean, limit: number): boolean {
  return more ? limit < MAX_PAGE : false;
}

function List({
  sessions,
  more,
  today,
  onPick,
  onMore,
}: {
  readonly sessions: readonly TreadmillSession[];
  readonly more: boolean;
  readonly today: string;
  readonly onPick: (id: string) => void;
  readonly onMore: () => void;
}): ReactNode {
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon="footprints"
        title="No sessions yet"
        body="Walks and runs appear here after they end. Sessions of ten seconds or less are not kept."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      {groupSessions(sessions, today).map((group) => (
        <View key={group.day} className="gap-2">
          <Text variant="label" tone="variant">
            {group.label}
          </Text>
          {group.sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              today={today}
              onPress={() => {
                onPick(session.id);
              }}
            />
          ))}
        </View>
      ))}
      {more ? <Button label="Show more" variant="tonal" onPress={onMore} /> : null}
    </View>
  );
}

function Listing({
  deviceId,
  personId,
  onPick,
}: {
  readonly deviceId: string;
  readonly personId: string;
  readonly onPick: (id: string) => void;
}): ReactNode {
  const [limit, setLimit] = useState(PAGE);
  const today = useDayKey();
  const query = useTreadmillView(deviceId, 'sessions', {
    limit,
    ...(personId === '' ? {} : { personId }),
  });
  return (
    <LoadedQuery query={query}>
      {(view) => (
        <List
          sessions={view.sessions}
          more={canShowMore(view.more, limit)}
          today={today}
          onPick={onPick}
          onMore={() => {
            setLimit((now) => Math.min(MAX_PAGE, now + PAGE));
          }}
        />
      )}
    </LoadedQuery>
  );
}

export function SessionsSection({ device }: { readonly device: Device }): ReactNode {
  const [picked, setPicked] = useState<string | null>(null);
  const [personId, setPersonId] = useState('');
  return (
    <View className="gap-section-gap">
      <BeltStrip device={device} />
      {picked === null ? (
        <>
          <View className="flex-row justify-end">
            <PersonChip personId={personId} onChange={setPersonId} />
          </View>
          <Listing deviceId={device.id} personId={personId} onPick={setPicked} />
        </>
      ) : (
        <>
          <View className="flex-row">
            <Button
              label="All sessions"
              variant="text"
              icon="chevronLeft"
              onPress={() => {
                setPicked(null);
              }}
            />
          </View>
          <SessionDetailView
            deviceId={device.id}
            sessionId={picked}
            onGone={() => {
              setPicked(null);
            }}
          />
        </>
      )}
    </View>
  );
}
