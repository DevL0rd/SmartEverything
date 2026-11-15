import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoGroup } from '@smarteverything/domain';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import type { MenuItem } from '../../../components/menu';
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
  readonly onReview: () => void;
}

function sheetItem(
  id: Exclude<PersonSheet, null>,
  label: string,
  disabled: boolean,
  onSheet: (sheet: PersonSheet) => void,
): MenuItem {
  return {
    id,
    label,
    icon: id,
    disabled,
    onPress: (): void => {
      onSheet(id);
    },
  };
}

function shareItem(group: PhotoGroup, disabled: boolean): MenuItem | null {
  if (group.kind !== 'person' || group.name === null) return null;
  return {
    id: 'share',
    label: 'Share with partner',
    icon: 'users',
    disabled,
    onPress: (): void => {
      router.push(href.photosPage('sharing', { group: group.id }));
    },
  };
}

export function usePersonMenu(
  group: PhotoGroup,
  live: boolean,
  onSheet: (sheet: PersonSheet) => void,
): readonly MenuItem[] {
  const actions = usePeopleActions();
  const disabled = !live || actions.busy;
  const hide: MenuItem = {
    id: 'hide',
    label: group.hidden ? 'Show in People and pets' : 'Hide from People and pets',
    icon: group.hidden ? 'eye' : 'eyeOff',
    disabled,
    onPress: (): void => {
      actions.update(group, { hidden: !group.hidden });
    },
  };
  const items = [
    group.kind === 'person' ? sheetItem('link', 'Link to a person', disabled, onSheet) : null,
    sheetItem('merge', 'Merge', disabled, onSheet),
    hide,
    shareItem(group, disabled),
  ];
  return items.filter((item): item is MenuItem => item !== null);
}

export function PersonHero({ group, live, onReview }: HeroProps): ReactNode {
  const actions = usePeopleActions();
  return (
    <Card>
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
        <Button
          label={notThisText(group.kind)}
          icon="circleX"
          variant="outlined"
          disabled={!live || actions.busy}
          onPress={onReview}
        />
      </View>
    </Card>
  );
}
