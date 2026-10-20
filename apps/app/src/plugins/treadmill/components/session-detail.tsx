import type { SessionDetail } from '@smarteverything/domain';
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
import { useTreadmillAct } from '../data/treadmill-act';
import { useTreadmillState, useTreadmillView } from '../data/treadmill-data';
import { sessionTitle, whenText } from '../model/session-model';
import { ProfileChart } from './profile-chart';
import { SegmentStrip } from './segment-strip';
import { FactGroups, KindBadges, factGroupsOf } from './session-facts';
import { SplitRows } from './split-rows';
import { TimeAtIncline } from './time-at-incline';
import { ZoneBar } from './zone-bar';

function WalkerPicker({
  deviceId,
  session,
}: {
  readonly deviceId: string;
  readonly session: SessionDetail['session'];
}): ReactNode {
  const owner = useIsOwner();
  const profiles = useProfiles();
  const { act } = useTreadmillAct(deviceId);
  if (!owner || profiles.length === 0) {
    return null;
  }
  return (
    <ChoiceChip
      label="Walker"
      icon="user"
      all=""
      value={session.walkerProfileId ?? ''}
      options={[
        { value: '', label: 'Nobody' },
        ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
      ]}
      onChange={(next) => {
        act(
          { action: 'assign_walker', sessionId: session.id, personId: next === '' ? null : next },
          'The walker could not be changed',
        );
      }}
    />
  );
}

function RemoveSession({
  deviceId,
  sessionId,
  onGone,
}: {
  readonly deviceId: string;
  readonly sessionId: string;
  readonly onGone: () => void;
}): ReactNode {
  const { act } = useTreadmillAct(deviceId);
  const remove = async (): Promise<void> => {
    const accepted = await confirm({
      title: 'Remove this session?',
      body: 'It leaves your history and the totals. Health records already written stay as they are.',
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
        background(remove(), 'treadmill.remove_failed');
      }}
    />
  );
}

function WalkerCard({
  deviceId,
  detail,
  walkerName,
  onGone,
}: {
  readonly deviceId: string;
  readonly detail: SessionDetail;
  readonly walkerName: string | null;
  readonly onGone: () => void;
}): ReactNode {
  return (
    <Card title="Walker" icon="user">
      <View className="gap-3">
        <Text variant="body-strong">{walkerName ?? 'Nobody assigned'}</Text>
        <WalkerPicker deviceId={deviceId} session={detail.session} />
        <RemoveSession deviceId={deviceId} sessionId={detail.session.id} onGone={onGone} />
      </View>
    </Card>
  );
}

function DetailBody({
  deviceId,
  detail,
  walkerName,
  onGone,
}: {
  readonly deviceId: string;
  readonly detail: SessionDetail;
  readonly walkerName: string | null;
  readonly onGone: () => void;
}): ReactNode {
  const today = useDayKey();
  const scale = useTreadmillState(deviceId).data?.inclineScale ?? 'unconfirmed';
  const { session } = detail;
  return (
    <View className="gap-section-gap">
      <Card>
        <View className="gap-3">
          <View className="gap-1">
            <Text variant="title-3">{sessionTitle(session)}</Text>
            <Text variant="footnote" tone="variant">
              {whenText(session, today)}
            </Text>
          </View>
          <KindBadges session={session} />
          <FactGroups groups={factGroupsOf(detail, scale)} />
        </View>
      </Card>
      <Card title={session.inclineMax === null ? 'Speed' : 'Speed and incline'} icon="trendUp">
        <ProfileChart detail={detail} scale={scale} />
      </Card>
      {Object.keys(session.inclineSeconds).length === 0 ? null : (
        <Card title="Time at each incline" icon="trendUp">
          <TimeAtIncline seconds={session.inclineSeconds} scale={scale} />
        </Card>
      )}
      <Card title={session.kind === 'intervals' ? 'Intervals' : 'Active and paused'} icon="timer">
        <SegmentStrip segments={detail.segments} />
      </Card>
      <Card title="Time in each zone" icon="gauge">
        <ZoneBar zones={session.zones} />
      </Card>
      <Card title="Splits" icon="route">
        <SplitRows splits={session.splits} />
      </Card>
      <WalkerCard deviceId={deviceId} detail={detail} walkerName={walkerName} onGone={onGone} />
    </View>
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
  const query = useTreadmillView(deviceId, 'session', { sessionId });
  return (
    <LoadedQuery query={query}>
      {(view) => (
        <DetailBody
          deviceId={deviceId}
          detail={view.detail}
          walkerName={view.walkerName}
          onGone={onGone}
        />
      )}
    </LoadedQuery>
  );
}
