import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { LoadedQuery } from '../../../components/loaded-query';
import type { Device } from '../../../store/state';
import { BottleStrip } from '../components/bottle-strip';
import { SessionRow } from '../components/session-row';
import { useBottleView } from '../data/bottle-data';

const PAGE = 20;
const MOST = 200;

export function SessionsSection({ device }: { readonly device: Device }): ReactNode {
  const [limit, setLimit] = useState(PAGE);
  const sessions = useBottleView(device.id, 'sessions', { limit });
  return (
    <View className="gap-section-gap">
      <BottleStrip device={device} />
      <LoadedQuery query={sessions}>
        {(view) =>
          view.sessions.length === 0 ? (
            <EmptyState
              icon="glassWater"
              title="No fills yet"
              body="Each time you refill the bottle, the drinks since the last fill appear here."
            />
          ) : (
            <View className="gap-3">
              {view.sessions.map((session) => (
                <SessionRow key={session.startedAt} deviceId={device.id} session={session} />
              ))}
              {view.more && limit < MOST ? (
                <Button
                  label="Show older fills"
                  variant="tonal"
                  onPress={() => {
                    setLimit((current) => Math.min(MOST, current + PAGE));
                  }}
                />
              ) : null}
            </View>
          )
        }
      </LoadedQuery>
    </View>
  );
}
