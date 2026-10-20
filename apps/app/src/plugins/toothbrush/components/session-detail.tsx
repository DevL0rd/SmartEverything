import type { BrushingSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ChoiceChip } from '../../../components/choice-chip';
import { confirm } from '../../../components/confirm-store';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useDayKey } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useIsOwner } from '../../../store/selectors';
import { useBrushAct } from '../data/brush-act';
import { useBrushState, useBrushView } from '../data/brush-data';
import { dayLabel, dayOfSession, localTime, sessionTitle } from '../model/session-model';
import { RecapBody } from './recap-body';

function Assign({
  deviceId,
  session,
}: {
  readonly deviceId: string;
  readonly session: BrushingSession;
}): ReactNode {
  const owner = useIsOwner();
  const profiles = useProfiles();
  const { act } = useBrushAct(deviceId);
  if (!owner || profiles.length === 0) {
    return null;
  }
  return (
    <ChoiceChip
      label="Brushed by"
      icon="user"
      all=""
      value={session.personId ?? ''}
      options={[
        { value: '', label: 'Nobody' },
        ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
      ]}
      onChange={(next) => {
        act(
          { action: 'assign_session', sessionId: session.id, personId: next === '' ? null : next },
          'The person could not be changed',
        );
      }}
    />
  );
}

function Remove({
  deviceId,
  sessionId,
  onGone,
}: {
  readonly deviceId: string;
  readonly sessionId: string;
  readonly onGone: () => void;
}): ReactNode {
  const { act } = useBrushAct(deviceId);
  const remove = async (): Promise<void> => {
    const accepted = await confirm({
      title: 'Remove this session?',
      body: 'It leaves your history and the totals.',
      confirmLabel: 'Remove',
      tone: 'destructive',
    });
    if (accepted) {
      act({ action: 'forget_session', sessionId }, 'The session could not be removed');
      onGone();
    }
  };
  return (
    <Button
      label="Remove this session"
      variant="text"
      icon="close"
      onPress={() => {
        background(remove(), 'toothbrush.remove_failed');
      }}
    />
  );
}

export function SessionDetailView({
  deviceId,
  sessionId,
  onGone,
}: {
  readonly deviceId: string;
  readonly sessionId: string;
  readonly onGone: () => void;
}): ReactNode {
  const query = useBrushView(deviceId, 'session', { sessionId });
  const state = useBrushState(deviceId);
  const today = useDayKey();
  return (
    <LoadedQuery query={query}>
      {(detail) =>
        state.data === undefined ? null : (
          <View className="gap-section-gap">
            <Card>
              <View className="gap-1 pb-3">
                <Text variant="title-3">{sessionTitle(detail.session)}</Text>
                <Text variant="footnote" tone="variant">
                  {dayLabel(dayOfSession(detail.session), today)} at {localTime(detail.session)}
                </Text>
              </View>
              <RecapBody session={detail.session} profile={state.data.profile} />
            </Card>
            <Card title="Brushed by" icon="user">
              <View className="gap-3">
                <Text variant="body-strong">{detail.personName ?? 'Nobody assigned'}</Text>
                <Assign deviceId={deviceId} session={detail.session} />
                <Remove deviceId={deviceId} sessionId={detail.session.id} onGone={onGone} />
              </View>
            </Card>
          </View>
        )
      }
    </LoadedQuery>
  );
}
