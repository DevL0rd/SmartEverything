import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useIdiom } from '../../../design/platform';
import { useIsOwner, useSession } from '../../../store/selectors';
import { ProfileAvatar } from '../../profiles';
import { GoogleMark } from './google-mark';
import { serviceRows, type ServiceRow } from './google-status';
import { googleHref, useGoogleAccounts, useGooglePeople } from './use-google';

function ServiceItem({
  row,
  me,
  owner,
}: {
  readonly row: ServiceRow;
  readonly me: string | null;
  readonly owner: boolean;
}): ReactNode {
  const size = useIdiom() === 'touch' ? 40 : 32;
  const title = owner ? `Google · ${row.who}` : 'Google';
  return (
    <ListRow
      leading={<GoogleMark dot={row.dot} size={size} />}
      title={title}
      subtitle={row.text}
      subtitleTone={row.critical ? 'critical' : 'variant'}
      wrapSubtitle
      label={`${title}, ${row.text}`}
      href={googleHref(row.person.id, me)}
      {...(owner ? { trailing: <ProfileAvatar profile={row.person} /> } : {})}
      chevron
    />
  );
}

export function ServicesSection(): ReactNode {
  const me = useSession().client.profile_id;
  const owner = useIsOwner();
  const rows = serviceRows(useGooglePeople(), useGoogleAccounts(), me, owner);
  return (
    <List
      inset
      title="Services"
      caption="each person links their own"
      footer={
        owner
          ? 'Used by Planner for Calendar and Tasks.'
          : 'Used by Planner for Calendar and Tasks. Device accounts belong to the owner. Ask them to add one.'
      }
    >
      {rows.map((row) => (
        <ServiceItem key={row.person.id} row={row} me={me} owner={owner} />
      ))}
    </List>
  );
}
