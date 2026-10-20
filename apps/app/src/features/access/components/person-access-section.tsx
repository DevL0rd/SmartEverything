import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PersonAccess, PersonRole, ProfileRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useActiveProfile } from '../../../store/people';
import { readMinute, useMinute } from '../../../store/clock';
import { useIsOwner, useRow, useSettings } from '../../../store/selectors';
import { PersonDevices } from '../../settings';
import { usePersonAccess, useAccessActions, type AccessActions } from '../data/access-data';
import {
  PERSON_ROLE_HELP,
  PERSON_ROLE_LABEL,
  PERSON_ROLE_ORDER,
  canEndNow,
  roleChange,
  standingOf,
} from '../model/standing';
import { EndsRow, HomeOnlyRow, PausedRow, RevokeRow } from './access-rows';
import { AuditList } from './audit-list';
import { AreasRow, BudgetRow, ChannelsRow, DevicesRow, ModelsRow, TemplateRow } from './scope-rows';
import { MemberAccess } from './member-access';
import { StandingCard } from './standing-card';

const ROLE_OPTIONS = PERSON_ROLE_ORDER.map((role) => ({
  value: role,
  label: PERSON_ROLE_LABEL[role],
}));

const RECENT = 5;

function RoleChoice({
  access,
  actions,
}: {
  readonly access: PersonAccess;
  readonly actions: AccessActions;
}): ReactNode {
  return (
    <View className="gap-2 p-card-pad">
      <Segmented<PersonRole>
        fill
        label="Role"
        options={ROLE_OPTIONS}
        value={access.role}
        onChange={(role) => {
          actions
            .change(access.profile_id, roleChange(role, access, readMinute()))
            .catch(notifyFailure('The role was not changed'));
        }}
      />
      <Text variant="footnote" tone="variant">
        {PERSON_ROLE_HELP[access.role]}
      </Text>
    </View>
  );
}

function Limits({
  access,
  actions,
}: {
  readonly access: PersonAccess;
  readonly actions: AccessActions;
}): ReactNode {
  return (
    <List title="Limits" footer="Owners are never limited.">
      <EndsRow access={access} actions={actions} />
      <HomeOnlyRow access={access} actions={actions} />
      <PausedRow access={access} actions={actions} />
    </List>
  );
}

function Reach({
  access,
  actions,
}: {
  readonly access: PersonAccess;
  readonly actions: AccessActions;
}): ReactNode {
  return (
    <List title="What they can reach" footer="Owners can always reach everything.">
      <TemplateRow access={access} actions={actions} />
      <AreasRow access={access} actions={actions} />
      <DevicesRow access={access} actions={actions} />
      <ModelsRow access={access} actions={actions} />
      <ChannelsRow access={access} actions={actions} />
      <BudgetRow access={access} actions={actions} />
    </List>
  );
}

function Loaded({
  profile,
  access,
}: {
  readonly profile: ProfileRow;
  readonly access: PersonAccess;
}): ReactNode {
  const actions = useAccessActions();
  const limited = access.role !== 'owner';
  const now = useMinute();
  const endable = canEndNow(standingOf(access, now, useSettings().time_zone));
  return (
    <>
      <List title="Access">
        <StandingCard access={access} />
        <RoleChoice access={access} actions={actions} />
      </List>
      {limited ? <Reach access={access} actions={actions} /> : null}
      {limited ? <Limits access={access} actions={actions} /> : null}
      <PersonDevices profileId={profile.id} />
      {endable ? (
        <List>
          <RevokeRow access={access} name={profile.name} actions={actions} />
        </List>
      ) : null}
      <AuditList limit={RECENT} profileId={profile.id} title="Recent refusals and changes" />
      <List>
        <ListRow title="All activity" icon="shield" href={href.settings.page('access')} chevron />
      </List>
    </>
  );
}

export function PersonAccessSection({ profileId }: { readonly profileId: string }): ReactNode {
  const owner = useIsOwner();
  const profile = useRow('profiles', profileId);
  const access = usePersonAccess(profileId);
  const mine = useActiveProfile()?.id === profileId;
  if (!owner) {
    return mine ? <MemberAccess /> : null;
  }
  if (profile === null) {
    return null;
  }
  if (access.isError) {
    return (
      <ErrorState
        error={access.error}
        retry={() => {
          background(access.refetch(), 'access.person_refetch_failed');
        }}
      />
    );
  }
  if (access.data === undefined) {
    return <Skeleton shape="block" className="h-40" />;
  }
  if (access.data === null) {
    return <ErrorState error={new Error(`${profile.name} has no access record.`)} />;
  }
  return <Loaded profile={profile} access={access.data} />;
}
