import type { ReactNode } from 'react';
import type { PersonAccess } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { joinParts, plural } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useRows, useSettings } from '../../../store/selectors';
import { ProfileAvatar } from '../../profiles';
import { usePeopleAccess } from '../data/access-data';
import {
  PERSON_ROLE_LABEL,
  conditionsText,
  standingOf,
  standingText,
  standingTone,
} from '../model/standing';

function PersonRow({
  access,
  devices,
}: {
  readonly access: PersonAccess;
  readonly devices: number;
}): ReactNode {
  const profile = useProfiles().find((entry) => entry.id === access.profile_id);
  const now = useMinute();
  const standing = standingOf(access, now, useSettings().time_zone);
  if (profile === undefined) {
    return null;
  }
  return (
    <ListRow
      title={profile.name}
      subtitle={joinParts([
        standingText(standing, now),
        access.role === 'owner' ? null : conditionsText(access.conditions),
        plural(devices, 'device'),
      ])}
      wrapSubtitle
      leading={<ProfileAvatar profile={profile} />}
      trailing={<Badge label={PERSON_ROLE_LABEL[access.role]} tone={standingTone(standing)} />}
      href={href.settings.profile(profile.id)}
      chevron
    />
  );
}

export function PeopleAccessBlock(): ReactNode {
  const people = usePeopleAccess();
  const clients = useRows('clients');
  if (people.isError) {
    return (
      <ErrorState
        error={people.error}
        retry={() => {
          background(people.refetch(), 'access.people_refetch_failed');
        }}
      />
    );
  }
  if (people.data === undefined) {
    return <Skeleton shape="block" className="h-40" />;
  }
  return (
    <List inset>
      {people.data.map((access) => (
        <PersonRow
          key={access.profile_id}
          access={access}
          devices={clients.filter((client) => client.profile_id === access.profile_id).length}
        />
      ))}
    </List>
  );
}
