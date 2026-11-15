import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoGroup } from '@smarteverything/domain';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button, type ButtonProps } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useProfiles } from '../../../store/people';
import { usePeopleActions, notThisText } from './actions';
import { FaceAvatar } from './face-avatar';
import { nameDraftOf, photosText } from './model';
import type { PersonSheet } from './person-sheets';

function NameField({
  group,
  disabled,
}: {
  readonly group: PhotoGroup;
  readonly disabled: boolean;
}): ReactNode {
  const actions = usePeopleActions();
  const [draft, setDraft] = useState(group.name ?? '');
  const next = nameDraftOf(draft);
  const changed = next !== group.name;
  const save = (): void => {
    if (changed) actions.update(group, { name: next });
  };
  return (
    <TextField
      label="Name"
      value={draft}
      placeholder={group.kind === 'pet' ? 'Name this pet' : 'Add a name'}
      disabled={disabled || actions.busy}
      onChange={setDraft}
      onSubmit={save}
      action={
        changed ? (
          <Button label="Save" variant="tonal" loading={actions.busy} onPress={save} />
        ) : undefined
      }
    />
  );
}

function LinkedLine({ group }: { readonly group: PhotoGroup }): ReactNode {
  const profile = useProfiles().find((entry) => entry.id === group.linkedProfileId);
  if (group.kind === 'pet') return null;
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name={profile === undefined ? 'unlink' : 'link'} size={16} tone="variant" />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {profile === undefined ? 'Not linked to a household member' : `Linked to ${profile.name}`}
      </Text>
    </View>
  );
}

export interface HeroProps {
  readonly group: PhotoGroup;
  readonly live: boolean;
  readonly onSheet: (sheet: PersonSheet) => void;
  readonly onReview: () => void;
}

function Slot(props: ButtonProps): ReactNode {
  return (
    <View className="min-w-36 grow">
      <Button variant="outlined" {...props} />
    </View>
  );
}

function HeroActions({ group, live, onSheet, onReview }: HeroProps): ReactNode {
  const actions = usePeopleActions();
  const disabled = !live || actions.busy;
  return (
    <View className="flex-row flex-wrap gap-2">
      {group.kind === 'person' ? (
        <Slot
          label="Link to a person"
          icon="link"
          disabled={disabled}
          onPress={() => {
            onSheet('link');
          }}
        />
      ) : null}
      <Slot
        label="Merge"
        icon="merge"
        disabled={disabled}
        onPress={() => {
          onSheet('merge');
        }}
      />
      <Slot label={notThisText(group.kind)} icon="circleX" disabled={disabled} onPress={onReview} />
      <Slot
        label={group.hidden ? 'Show' : 'Hide'}
        icon={group.hidden ? 'eye' : 'eyeOff'}
        disabled={disabled}
        onPress={() => {
          actions.update(group, { hidden: !group.hidden });
        }}
      />
      {group.kind === 'person' && group.name !== null ? (
        <Slot
          label="Share with partner"
          icon="users"
          variant="tonal"
          disabled={disabled}
          onPress={() => {
            router.push(href.photosPage('sharing', { group: group.id }));
          }}
        />
      ) : null}
    </View>
  );
}

export function PersonHero(props: HeroProps): ReactNode {
  const { group, live } = props;
  return (
    <Card>
      <View className="gap-4">
        <View className="flex-row flex-wrap items-center gap-4">
          <FaceAvatar itemId={group.coverItemId} box={group.coverBox} kind={group.kind} size={96} />
          <View className="min-w-56 flex-1 gap-2">
            <NameField key={group.name ?? ''} group={group} disabled={!live} />
            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
              <Text variant="footnote" className="tabular-nums font-sans-medium">
                {photosText(group.count)}
              </Text>
              <LinkedLine group={group} />
              {group.hidden ? (
                <Text variant="footnote" tone="variant">
                  Hidden from People and pets
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        <HeroActions {...props} />
      </View>
    </Card>
  );
}
