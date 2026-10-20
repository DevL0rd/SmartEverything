import type { TreadmillSession, TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { useDayKey } from '../../../store/clock';
import { sessionTitle, whenText } from '../model/session-model';
import { FactTiles, KindBadges, factsOf } from './session-facts';
import { ZoneBar } from './zone-bar';

export function LastSession({
  deviceId,
  session,
}: {
  readonly deviceId: string;
  readonly session: TreadmillStateView['lastSession'];
}): ReactNode {
  const today = useDayKey();
  if (session === null) {
    return (
      <Card>
        <EmptyState
          compact
          icon="footprints"
          title="No sessions yet"
          body="Hold the start button for a second to begin. Your walks show up here."
        />
      </Card>
    );
  }
  return (
    <Card title="Last session" icon="route">
      <LastSessionBody deviceId={deviceId} session={session} today={today} />
    </Card>
  );
}

function LastSessionBody({
  deviceId,
  session,
  today,
}: {
  readonly deviceId: string;
  readonly session: TreadmillSession;
  readonly today: string;
}): ReactNode {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text variant="title-3">{sessionTitle(session)}</Text>
        <Text variant="footnote" tone="variant">
          {whenText(session, today)}
        </Text>
      </View>
      <KindBadges session={session} />
      <FactTiles facts={factsOf(session)} />
      <ZoneBar zones={session.zones} />
      <Button
        label="All sessions"
        variant="tonal"
        icon="chevronRight"
        href={href.deviceSection(deviceId, 'sessions')}
      />
    </View>
  );
}
