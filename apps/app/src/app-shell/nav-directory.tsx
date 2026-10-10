import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ListRow } from '../components/list-row';
import { List } from '../components/section';
import { useValue } from '../design/external-store';
import { useUnreadChatCount } from '../features/assistant';
import { ProfileAvatar, ProfileSwitcher } from '../features/profiles';
import { useActiveProfile, useProfiles } from '../store/people';
import { useAvailability, useIsOwner, useSettings } from '../store/selectors';
import { CONNECTIONS_ACTION, HOME_ACTIONS } from './home-actions';
import { href } from './hrefs';
import { NavItems, navIntent } from './nav-groups';
import { directoryModel, navEntries } from './nav-model';
import { closeNavSheet, goFromDirectory, navCurrent } from './nav-sheet-state';

function leaveTo(target: Href): void {
  closeNavSheet();
  router.push(target);
}

function ProfileBlock(): ReactNode {
  const profile = useActiveProfile();
  const profiles = useProfiles();
  if (profile === null) {
    return null;
  }
  return (
    <List inset>
      <ListRow
        title={profile.name}
        subtitle="Profile settings"
        leading={<ProfileAvatar profile={profile} size="nav" />}
        chevron
        onPress={() => {
          leaveTo(href.settings.profile(profile.id));
        }}
      />
      {profiles.length > 1 ? <ProfileSwitcher /> : null}
    </List>
  );
}

function Destinations({ compact }: { readonly compact: boolean }): ReactNode {
  const current = useValue(navCurrent);
  const availability = useAvailability();
  const unread = useUnreadChatCount();
  const entries = navEntries(directoryModel(current, availability, unread));
  if (compact) {
    return (
      <View className="flex-row flex-wrap">
        <NavItems entries={entries} go={goFromDirectory} intent={navIntent} look="tile" />
      </View>
    );
  }
  return (
    <View className="gap-0.5">
      <NavItems entries={entries} go={goFromDirectory} intent={navIntent} />
    </View>
  );
}

function QuickActions(): ReactNode {
  const owner = useIsOwner();
  const settings = useSettings();
  const actions = owner ? [...HOME_ACTIONS, CONNECTIONS_ACTION] : HOME_ACTIONS;
  return (
    <List title={settings.home_name} inset>
      {actions.map((action) => (
        <ListRow
          key={action.label}
          title={action.label}
          icon={action.icon}
          chevron
          onPress={() => {
            leaveTo(action.href);
          }}
        />
      ))}
    </List>
  );
}

export function NavDirectory({ compact = false }: { readonly compact?: boolean }): ReactNode {
  return (
    <View className="gap-section-gap">
      <ProfileBlock />
      <Destinations compact={compact} />
      <QuickActions />
    </View>
  );
}
