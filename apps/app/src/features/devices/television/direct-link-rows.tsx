import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import type { DirectAddress } from './direct-link';

export function directLinkRows(address: DirectAddress | null): ReactNode {
  if (address === null) {
    return (
      <ListRow
        title="Not linked"
        subtitle="Link this screen over your home network so the hub controls it and can turn it on without SmartThings"
        wrapSubtitle
        icon="link"
        iconTone="variant"
      />
    );
  }
  return (
    <>
      <ListRow
        title="Linked directly"
        subtitle="Controls go to the screen first, SmartThings is the backup"
        wrapSubtitle
        icon="link"
        value={address.host}
      />
      <ListRow
        title="Turning on"
        subtitle="Wake-on-LAN ready"
        subtitleTone="positive"
        caption={`Uses ${address.mac}, read from the screen`}
        icon="power"
      />
    </>
  );
}
