import type { BrushingSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useDayKey } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { SessionDetailView } from '../components/session-detail';
import { SessionRow } from '../components/session-row';
import { useBrushState, useBrushView } from '../data/brush-data';
import { groupSessions } from '../model/session-model';

const PAGE = 20;
const MAX_PAGE = 200;

function canShowMore(more: boolean, limit: number): boolean {
  return more ? limit < MAX_PAGE : false;
}

function Groups({
  sessions,
  today,
  onPick,
}: {
  readonly sessions: readonly BrushingSession[];
  readonly today: string;
  readonly onPick: (id: string) => void;
}): ReactNode {
  return groupSessions(sessions, today).map((group) => (
    <View key={group.day} className="gap-2">
      <Text variant="label" tone="variant">
        {group.label}
      </Text>
      {group.sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          onPress={() => {
            onPick(session.id);
          }}
        />
      ))}
    </View>
  ));
}

function List({
  sessions,
  more,
  hidden,
  today,
  onPick,
  onMore,
}: {
  readonly sessions: readonly BrushingSession[];
  readonly more: boolean;
  readonly hidden: number;
  readonly today: string;
  readonly onPick: (id: string) => void;
  readonly onMore: () => void;
}): ReactNode {
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon="toothbrush"
        title="No sessions yet"
        body="Brushings appear here after they end. Anything under ten seconds is not kept."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <Groups sessions={sessions} today={today} onPick={onPick} />
      {hidden === 0 ? null : (
        <Text variant="footnote" tone="faint">
          {hidden === 1 ? '1 session belongs' : `${String(hidden)} sessions belong`} to someone else
          and is not shown.
        </Text>
      )}
      {more ? <Button label="Show more" variant="tonal" onPress={onMore} /> : null}
    </View>
  );
}

function Listing({
  deviceId,
  onPick,
}: {
  readonly deviceId: string;
  readonly onPick: (id: string) => void;
}): ReactNode {
  const [limit, setLimit] = useState(PAGE);
  const today = useDayKey();
  const query = useBrushView(deviceId, 'sessions', { limit });
  return (
    <LoadedQuery query={query}>
      {(view) => (
        <List
          sessions={view.sessions}
          more={canShowMore(view.more, limit)}
          hidden={view.hidden}
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
  const state = useBrushState(device.id);
  if (state.data !== undefined && !state.data.mine) {
    return (
      <EmptyState
        icon="eyeOff"
        title="Sessions are private"
        body={
          state.data.personName === null
            ? 'Only the person this brush is set up for sees the history.'
            : `Sessions on this brush belong to ${state.data.personName}.`
        }
      />
    );
  }
  return (
    <View className="gap-section-gap">
      {picked === null ? (
        <Listing deviceId={device.id} onPick={setPicked} />
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
