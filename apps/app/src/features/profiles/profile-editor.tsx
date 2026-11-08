import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { ACCENTS, PROFILE_NAME_MAX, type ProfileRow } from '@smarteverything/domain';
import { updateProfile } from '../../api/people';
import { href } from '../../app-shell/hrefs';
import { ColourSwatches } from '../../components/colour-swatches';
import { confirm } from '../../components/confirm-store';
import { EmptyState } from '../../components/empty-state';
import { List } from '../../components/section';
import { ListRow } from '../../components/list-row';
import { PageHeader } from '../../components/page-header';
import { Screen } from '../../components/screen';
import { ACCENT_LABELS, ACCENT_SWATCH } from '../../design/tokens';
import { TextEditSheet } from '../../settings/text-edit-sheet';
import { useProfiles } from '../../store/people';
import { useIsOwner, useRow } from '../../store/selectors';
import { BodyDetails, useProfileSave } from './body-details';
import { useNameEditor } from './name-editor';
import { ProfileAvatar } from './profile-avatar';
import { profileRemovalOptions } from './profile-removal';
import { background } from '@smarteverything/logging';

function Look({ profile }: { readonly profile: ProfileRow }): ReactNode {
  const { save } = useProfileSave(profile.id);
  return (
    <View className="gap-3 p-card-pad">
      <ColourSwatches
        label="Colour"
        value={profile.colour}
        options={ACCENTS.map((accent) => ({
          value: accent,
          label: ACCENT_LABELS[accent],
          swatchClassName: ACCENT_SWATCH[accent],
        }))}
        onChange={(colour) => {
          save({ colour });
        }}
      />
    </View>
  );
}

function Removal({ profile }: { readonly profile: ProfileRow }): ReactNode {
  const router = useRouter();
  const last = useProfiles().length <= 1;
  const remove = useMutation(
    profileRemovalOptions(profile, () => {
      router.replace(href.settings.page('profiles'));
    }),
  );
  if (!useIsOwner() || last) {
    return null;
  }
  return (
    <List>
      <ListRow
        title={`Remove ${profile.name}`}
        icon="trash"
        destructive
        wrapTitle
        onPress={() => {
          background(
            confirm({
              title: 'Remove this person?',
              body: 'Their health data and weigh-ins are deleted. Their apps switch to another person.',
              confirmLabel: 'Remove',
              tone: 'destructive',
              typed: profile.name,
            }).then((yes) => {
              if (yes) {
                remove.mutate();
              }
            }),
            'profile_editor.confirm_failed',
          );
        }}
      />
    </List>
  );
}

function ProfileName({ profile }: { readonly profile: ProfileRow }): ReactNode {
  const editor = useNameEditor();
  return (
    <>
      <List>
        <ListRow
          title={profile.name}
          subtitle="Name"
          label={`Edit name for ${profile.name}`}
          wrapTitle
          pressRef={editor.opener}
          leading={<ProfileAvatar profile={profile} size="l" />}
          onPress={() => {
            editor.open({
              title: 'Name',
              label: 'Name',
              initial: profile.name,
              placeholder: 'Their first name',
              confirmLabel: 'Save',
              maxLength: PROFILE_NAME_MAX,
              save: async (name) => {
                await updateProfile(profile.id, { name });
              },
            });
          }}
        />
      </List>
      <TextEditSheet request={editor.request} onClose={editor.close} />
    </>
  );
}

function Editor({
  profile,
  extra,
}: {
  readonly profile: ProfileRow;
  readonly extra: ReactNode;
}): ReactNode {
  return (
    <View className="gap-section-gap web:flex-row web:flex-wrap web:items-start">
      <View className="min-w-0 max-w-reading gap-section-gap web:shrink web:grow web:basis-96">
        <ProfileName profile={profile} />
        <List title="Colour">
          <Look profile={profile} />
        </List>
        <List title="Body" footer="Your scale uses these to work out body fat, muscle and water.">
          <BodyDetails profile={profile} />
        </List>
      </View>
      <View className="min-w-0 max-w-reading gap-section-gap web:shrink web:grow web:basis-96 web:empty:hidden">
        {extra}
        <Removal profile={profile} />
      </View>
    </View>
  );
}

export function ProfileEditorScreen({
  profileId,
  extra,
}: {
  readonly profileId: string;
  readonly extra: ReactNode;
}): ReactNode {
  const profile = useRow('profiles', profileId);
  return (
    <Screen
      header={<PageHeader title={profile?.name ?? 'Person'} titleLines="wrap" />}
      maxWidth={profile === null ? 'reading' : 'detail'}
    >
      {profile === null ? (
        <EmptyState icon="users" title="Person not found" body="They may have been removed." />
      ) : (
        <Editor key={profile.id} profile={profile} extra={extra} />
      )}
    </Screen>
  );
}
