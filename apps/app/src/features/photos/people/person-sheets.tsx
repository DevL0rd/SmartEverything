import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoGroup } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useProfiles } from '../../../store/people';
import { usePeopleActions } from './actions';
import { FaceAvatar } from './face-avatar';
import { groupTitleOf, mergeTargetsOf, photosText } from './model';
import { usePhotoPeople } from './queries';

export type PersonSheet = 'link' | 'merge' | null;

export const LINK_NOTE =
  'Linking tells the app which household member this is. Only you see the link and the name.';

function LinkRow({
  title,
  icon,
  picked,
  disabled,
  onPress,
}: {
  readonly title: string;
  readonly icon: 'user' | 'unlink';
  readonly picked: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <ListRow
      title={title}
      icon={icon}
      selected={picked}
      trailing={picked ? <Icon name="check" size={20} tone="primary" /> : undefined}
      disabled={disabled}
      onPress={onPress}
    />
  );
}

function LinkSheet({
  group,
  onClose,
}: {
  readonly group: PhotoGroup;
  readonly onClose: () => void;
}): ReactNode {
  const profiles = useProfiles();
  const actions = usePeopleActions();
  const pick = (linkedProfileId: string | null): void => {
    if (linkedProfileId === group.linkedProfileId) onClose();
    else actions.update(group, { linkedProfileId }, onClose);
  };
  return (
    <View className="gap-1 pb-2">
      <Text variant="footnote" tone="variant" className="pb-2">
        {LINK_NOTE}
      </Text>
      {[...profiles.map((profile) => ({ id: profile.id, name: profile.name })), null].map(
        (profile) => (
          <LinkRow
            key={profile?.id ?? 'none'}
            title={profile?.name ?? 'Not linked'}
            icon={profile === null ? 'unlink' : 'user'}
            picked={group.linkedProfileId === (profile?.id ?? null)}
            disabled={actions.busy}
            onPress={() => {
              pick(profile?.id ?? null);
            }}
          />
        ),
      )}
    </View>
  );
}

function MergeRow({
  group,
  picked,
  onToggle,
}: {
  readonly group: PhotoGroup;
  readonly picked: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <ListRow
      title={groupTitleOf(group)}
      subtitle={photosText(group.count)}
      leading={
        <FaceAvatar itemId={group.coverItemId} box={group.coverBox} kind={group.kind} size={40} />
      }
      role="checkbox"
      checked={picked}
      onPress={onToggle}
    />
  );
}

function toggled(held: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(held);
  if (!next.delete(id)) next.add(id);
  return next;
}

function MergeList({
  group,
  targets,
  picked,
  onToggle,
}: {
  readonly group: PhotoGroup;
  readonly targets: readonly PhotoGroup[];
  readonly picked: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
}): ReactNode {
  if (targets.length === 0) {
    return (
      <Text variant="body" tone="variant" className="py-4">
        {group.kind === 'pet'
          ? 'There are no other pets of this kind.'
          : 'There are no other people.'}
      </Text>
    );
  }
  return targets.map((target) => (
    <MergeRow
      key={target.id}
      group={target}
      picked={picked.has(target.id)}
      onToggle={() => {
        onToggle(target.id);
      }}
    />
  ));
}

function MergeSheet({
  group,
  onClose,
}: {
  readonly group: PhotoGroup;
  readonly onClose: () => void;
}): ReactNode {
  const people = usePhotoPeople().data;
  const actions = usePeopleActions();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const targets = mergeTargetsOf(group, people?.groups ?? []);
  const sources = targets.filter((target) => picked.has(target.id));
  return (
    <View className="gap-2 pb-2">
      <Text variant="footnote" tone="variant">
        {`Pick the groups that are ${groupTitleOf(group)}. Their photos join this one.`}
      </Text>
      <MergeList
        group={group}
        targets={targets}
        picked={picked}
        onToggle={(id) => {
          setPicked((held) => toggled(held, id));
        }}
      />
      <View className="flex-row justify-end gap-2 pt-2">
        <Button label="Cancel" variant="text" onPress={onClose} />
        <Button
          label={sources.length === 0 ? 'Merge' : `Merge ${String(sources.length)}`}
          variant="filled"
          disabled={sources.length === 0 || actions.busy}
          loading={actions.busy}
          onPress={() => {
            actions.merge(group, sources, onClose);
          }}
        />
      </View>
    </View>
  );
}

export function PersonSheets({
  group,
  sheet,
  onClose,
}: {
  readonly group: PhotoGroup;
  readonly sheet: PersonSheet;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <>
      <Sheet
        open={sheet === 'link'}
        onClose={onClose}
        title="Link to a person"
        detents={['half', 'full']}
      >
        {sheet === 'link' ? <LinkSheet group={group} onClose={onClose} /> : null}
      </Sheet>
      <Sheet
        open={sheet === 'merge'}
        onClose={onClose}
        title={`Merge into ${groupTitleOf(group)}`}
        detents={['half', 'full']}
      >
        {sheet === 'merge' ? <MergeSheet group={group} onClose={onClose} /> : null}
      </Sheet>
    </>
  );
}
