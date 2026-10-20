import type { ReactNode } from 'react';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { Banner } from '../../../components/banner';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { foundScreens, type FoundScreen } from './direct-link';

const NONE_FOUND =
  'No Samsung screen answered. Turn the screen on, keep it on the same network as the hub and look again.';

export function FoundScreens({
  deviceId,
  attempt,
  disabled,
  onPick,
}: {
  readonly deviceId: string;
  readonly attempt: number;
  readonly disabled: boolean;
  readonly onPick: (host: string) => void;
}): ReactNode {
  const query = useScreenQuery({
    queryKey: ['window', 'television-candidates', deviceId, attempt],
    queryFn: () => api().call(E.listTelevisionCandidates, { params: { deviceId } }),
    gcTime: 0,
    retry: false,
  });
  if (query.isError) {
    return <Banner tone="critical" title="The hub could not look for screens" />;
  }
  if (query.data === undefined) {
    return (
      <List title="Screens on your network">
        <ListRow
          title="Looking for Samsung screens"
          icon="wifi"
          subtitle="This takes a few seconds"
        />
      </List>
    );
  }
  return (
    <ScreenRows screens={foundScreens(query.data, deviceId)} disabled={disabled} onPick={onPick} />
  );
}

function ScreenRows({
  screens,
  disabled,
  onPick,
}: {
  readonly screens: readonly FoundScreen[];
  readonly disabled: boolean;
  readonly onPick: (host: string) => void;
}): ReactNode {
  return (
    <List title="Screens on your network">
      {screens.length === 0 ? (
        <ListRow title="Nothing found" icon="wifi" subtitle={NONE_FOUND} wrapSubtitle />
      ) : (
        screens.map((screen) => (
          <ListRow
            key={screen.host}
            title={screen.name}
            subtitle={screen.detail}
            wrapSubtitle
            {...(screen.note === null ? {} : { caption: screen.note })}
            icon="tv"
            chevron
            disabled={disabled}
            onPress={() => {
              onPick(screen.host);
            }}
          />
        ))
      )}
    </List>
  );
}
