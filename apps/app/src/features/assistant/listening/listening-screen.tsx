import type { ReactNode } from 'react';
import { Banner } from '../../../components/banner';
import { LoadedQuery } from '../../../components/loaded-query';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useIsOwner } from '../../../store/selectors';
import { ListeningBody } from './listening-body';
import { useAllowedCameras, useHubOffline, useListeningView } from './listening-data';

const LISTENING_PAGE = 'assistant/listening';

function Notices({
  offline,
  owner,
}: {
  readonly offline: boolean;
  readonly owner: boolean;
}): ReactNode {
  return (
    <>
      {offline ? (
        <Banner
          tone="info"
          title="Offline · showing saved state"
          body="Changes need a connection to your hub. Levels are not available."
          wrapBody
        />
      ) : null}
      {owner ? null : (
        <Banner
          tone="info"
          title="Your devices only"
          body="Cameras, Discord and walkie channels are managed by the owner. You can change your own phones and computers."
          wrapBody
        />
      )}
    </>
  );
}

export function ListeningScreen(): ReactNode {
  const query = useListeningView();
  const allowed = useAllowedCameras();
  const offline = useHubOffline();
  const owner = useIsOwner();
  return (
    <SettingsFrame
      page={LISTENING_PAGE}
      maxWidth="detail"
      banner={<Notices offline={offline} owner={owner} />}
    >
      <LoadedQuery query={query}>
        {(view) => <ListeningBody view={view} allowed={allowed} offline={offline} />}
      </LoadedQuery>
    </SettingsFrame>
  );
}
