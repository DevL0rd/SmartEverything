import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ListRow } from '../components/list-row';
import { List } from '../components/section';
import { ProfileAvatar, ProfileSwitcher } from '../features/profiles';
import { useActiveProfile, useProfiles } from '../store/people';
import { useIsOwner, useSettings } from '../store/selectors';
import { CONNECTIONS_ACTION, HOME_ACTIONS } from './home-actions';
import { href } from './hrefs';
import { SheetPages } from './nav-sheet-pages';
import { closeNavSheet } from './nav-sheet-state';

function leaveTo(target: Href): void {
  closeNavSheet();
  router.navigate(target);
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

export function NavDirectory(): ReactNode {
  return (
    <View className="gap-section-gap">
      <ProfileBlock />
      <SheetPages />
      <QuickActions />
    </View>
  );
}
