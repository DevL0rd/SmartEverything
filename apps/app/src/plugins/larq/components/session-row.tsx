import type { BottleReadingRow, BottleSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Card } from '../../../components/card';
import { Sparkline } from '../../../components/charts';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { Badge } from '../../../components/badge';
import { clock, dayKeyOf } from '../../../format/time';
import { millilitres } from '../../../format/number';
import { useMinute } from '../../../store/clock';
import { useBottleView } from '../data/bottle-data';
import { WATER_COLOUR } from '../model/bottle-colours';
import { curveOf, sessionCardOf } from '../model/session-model';

function Readings({
  deviceId,
  session,
}: {
  readonly deviceId: string;
  readonly session: BottleSession;
}): ReactNode {
  const day = dayKeyOf(Date.parse(session.startedAt));
  const readings = useBottleView(deviceId, 'readings', { day, limit: 200 });
  const inside = (row: BottleReadingRow): boolean =>
    Date.parse(row.at) >= Date.parse(session.startedAt) &&
    Date.parse(row.at) <= Date.parse(session.endedAt);
  return (
    <LoadedQuery query={readings}>
      {(view) => (
        <View className="gap-1 pb-4">
          {view.readings.filter(inside).map((row) => (
            <View
              key={`${row.at}-${row.trigger}-${String(row.distanceMm)}`}
              className="min-h-touch-min flex-row items-center justify-between gap-3"
            >
              <Text variant="body">{clock(row.at)}</Text>
              <Text variant="callout" tone="variant" className="flex-1">
                {row.kind === 'rejected'
                  ? `Skipped (${row.verdict.replaceAll('_', ' ')})`
                  : row.kind}
              </Text>
              <Text variant="body-strong" className="tabular">
                {row.volumeMl === null ? '—' : millilitres(row.volumeMl)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </LoadedQuery>
  );
}

function Header({ card }: { readonly card: ReturnType<typeof sessionCardOf> }): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {card.title}
        </Text>
        <Text variant="footnote" tone="variant">
          {card.when}
        </Text>
      </View>
      {card.open ? <Badge label="Current" tone="info" /> : null}
    </View>
  );
}

function Facts({ card }: { readonly card: ReturnType<typeof sessionCardOf> }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
      <Text variant="callout">{card.drunk}</Text>
      <Text variant="callout" tone="variant">
        {card.drinks}
      </Text>
      <Text variant="callout" tone="variant">
        {card.span}
      </Text>
    </View>
  );
}

export function SessionRow({
  deviceId,
  session,
}: {
  readonly deviceId: string;
  readonly session: BottleSession;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const card = sessionCardOf(session, useMinute());
  const points = curveOf(session);
  return (
    <>
      <Card
        label={card.summary}
        onPress={() => {
          setOpen(true);
        }}
      >
        <Header card={card} />
        {points.length >= 2 ? (
          <Sparkline points={points} colour={WATER_COLOUR} height={36} area />
        ) : null}
        <Facts card={card} />
      </Card>
      <BottomSheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={card.title}
        label="Readings in this fill"
        detents={['half', 'full']}
        scroll
      >
        <Readings deviceId={deviceId} session={session} />
      </BottomSheet>
    </>
  );
}
