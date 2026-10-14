import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { measureAnchor, type Rect } from '../../components/anchor';
import { SelectPicker } from '../../components/select-picker';
import { Interactive } from '../../components/interactive';
import { ProfileAvatar } from './profile-avatar';
import { selectProfile } from '../../api/people';
import { SelectRow } from '../../components/rows';
import { notify } from '../../components/toast-store';
import { useActiveProfile, useProfiles } from '../../store/people';

export function ProfileSwitcher({ compact = false }: { readonly compact?: boolean }): ReactNode {
  const profiles = useProfiles();
  const active = useActiveProfile();
  if (compact) return <CompactProfileSwitcher />;
  return (
    <SelectRow
      title="This app belongs to"
      subtitle="Preferences, layouts and health data follow them"
      icon="smartphone"
      options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
      value={active?.id ?? null}
      placeholder="Choose a person"
      onChange={(profileId) => {
        selectProfile(profileId).catch((error: unknown) => {
          notify({ message: 'The profile was not changed', error, tone: 'critical' });
        });
      }}
    />
  );
}

function CompactProfileSwitcher(): ReactNode {
  const active = useActiveProfile();
  const profiles = useProfiles();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  if (active === null) return null;
  return (
    <>
      <View ref={ref} collapsable={false}>
        <Interactive
          label={`Profile: ${active.name}. Choose a person`}
          className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full"
          layerClassName="rounded-full"
          onPress={() => {
            measureAnchor(ref, setAnchor);
          }}
        >
          <ProfileAvatar profile={active} />
        </Interactive>
      </View>
      <SelectPicker
        label="This app belongs to"
        options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
        value={active.id}
        anchor={anchor}
        onClose={() => {
          setAnchor(null);
        }}
        onPick={(profileId) => {
          selectProfile(profileId).catch((error: unknown) => {
            notify({ message: 'The profile was not changed', error, tone: 'critical' });
          });
        }}
      />
    </>
  );
}
