import type { BrushProfile, BrushingSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { MouthMap } from '../charts/mouth-map';
import { PressureStrip } from '../charts/pressure-strip';
import { clockText } from '../model/brush-model';
import { recapOf, resultOf, sessionTitle, type Recap } from '../model/session-model';
import { sessionZoneStates } from '../model/stage-model';
import { brandUi } from '../brands';
import { ZONE_TEXT } from '../model/zone-text';

const MAP_PX = 132;

function ZoneLines({
  reached,
  missed,
}: {
  readonly reached: readonly string[];
  readonly missed: readonly string[];
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      {reached.length === 0 ? null : (
        <Text variant="footnote" tone="variant">
          Reached: {reached.join(', ')}
        </Text>
      )}
      {missed.length === 0 ? null : (
        <Text variant="footnote" tone="warning">
          Not reached: {missed.join(', ')}
        </Text>
      )}
    </View>
  );
}

function PressureLines({
  session,
  profile,
  recap,
}: {
  readonly session: BrushingSession;
  readonly profile: BrushProfile;
  readonly recap: Recap;
}): ReactNode {
  return (
    <View className="gap-1">
      {recap.runs.length === 0 ? null : (
        <>
          <Text variant="caption" tone="variant">
            Pressure during the session
          </Text>
          <PressureStrip brand={profile.brand} runs={recap.runs} seconds={session.durationS} />
        </>
      )}
      {recap.excess === null ? null : (
        <Text variant="footnote" tone="variant">
          {recap.excess}
        </Text>
      )}
    </View>
  );
}

export function RecapBody({
  session,
  profile,
}: {
  readonly session: BrushingSession;
  readonly profile: BrushProfile;
}): ReactNode {
  const recap = recapOf(session, profile);
  const result = resultOf(session);
  const { StageExtras, Recap } = brandUi(profile.brand);
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={result.word} tone={result.tone} />
        <Text variant="callout" className="tabular">
          {clockText(session.durationS)} of {clockText(session.routineS)}
        </Text>
      </View>
      {StageExtras === null ? null : <StageExtras intensity={session.intensity} />}
      {Recap === null ? (
        <>
          {profile.zones === 0 || !recap.zonesShown ? null : (
            <View className="flex-row items-center gap-4">
              <MouthMap
                profile={profile}
                states={sessionZoneStates(session, profile)}
                size={MAP_PX}
                label={`${sessionTitle(session)}, zones reached`}
              />
              <ZoneLines reached={recap.reached} missed={recap.missed} />
            </View>
          )}
          {recap.zonesShown ? (
            <Text variant="caption" tone="faint">
              {ZONE_TEXT[recap.source].recap}
            </Text>
          ) : null}
        </>
      ) : (
        <Recap session={session} profile={profile} />
      )}
      {session.pressure === null ? null : (
        <PressureLines session={session} profile={profile} recap={recap} />
      )}
    </View>
  );
}
