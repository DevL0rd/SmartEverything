import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { TALK_CHANNEL_NAME, type TalkChannelRow } from '@smarteverything/domain';
import {
  createTalkChannel,
  removeTalkChannel,
  removeTalkMember,
  setTalkMember,
  updateTalkChannel,
} from '../../../api/talk';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { settingsTrail } from '../../../settings/tree';
import { ActionRow } from '../../../components/rows';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { useRow } from '../../../store/selectors';
import { useChannelMembers } from '../data/talk-data';
import {
  NEW_CHANNEL,
  draftMembersOf,
  fieldsOf,
  memberKey,
  type ChannelFields,
  type DraftMember,
} from './channel-draft';
import { ChannelFieldsBlock } from './channel-fields';
import { ChannelMembersBlock, type MemberChange } from './channel-members';

const CRUMBS = settingsTrail('talk/channels');

const PARAMS = z.object({ channelId: z.string().min(1) });

function failed(message: string): (error: unknown) => void {
  return (error) => {
    notify({ message, error, tone: 'critical' });
  };
}

function nameProblem(name: string): string | null {
  return TALK_CHANNEL_NAME.safeParse(name).success
    ? null
    : 'Give the channel a name (up to 40 letters)';
}

async function speakerAllowed(change: MemberChange): Promise<boolean> {
  if (change.kind !== 'camera' || !change.listening) {
    return true;
  }
  return confirm({
    title: 'Play this channel on the camera?',
    body: 'Everyone near the camera will hear what is said on the channel.',
    confirmLabel: 'Turn on speaker',
  });
}

function applied(members: readonly DraftMember[], change: MemberChange): readonly DraftMember[] {
  const others = members.filter(
    (member) => memberKey(member.kind, member.memberId) !== memberKey(change.kind, change.memberId),
  );
  return change.member
    ? [...others, { kind: change.kind, memberId: change.memberId, listening: change.listening }]
    : others;
}

function useCreate(
  fields: ChannelFields,
  members: readonly DraftMember[],
): { readonly saving: boolean; readonly create: () => void } {
  const [saving, setSaving] = useState(false);
  const create = (): void => {
    setSaving(true);
    createTalkChannel({
      ...fields,
      members: members.map((member) => ({
        member_kind: member.kind,
        member_id: member.memberId,
        listening: member.listening,
      })),
    }).then(
      (row) => {
        router.replace(href.talkChannel(row.id), { withAnchor: true });
      },
      (error: unknown) => {
        setSaving(false);
        failed('The channel wasn’t created')(error);
      },
    );
  };
  return { saving, create };
}

function CreateBar({
  saving,
  ready,
  onCreate,
}: {
  readonly saving: boolean;
  readonly ready: boolean;
  readonly onCreate: () => void;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <View className={touch ? 'items-stretch' : 'items-end'}>
      <Button
        label="Create channel"
        icon="plus"
        size="lg"
        grow={touch}
        loading={saving}
        disabled={!ready}
        {...(ready ? {} : { hint: 'Give it a name and add at least one member' })}
        onPress={onCreate}
      />
    </View>
  );
}

function NewChannel(): ReactNode {
  const [fields, setFields] = useState<ChannelFields>(NEW_CHANNEL);
  const [members, setMembers] = useState<readonly DraftMember[]>([]);
  const { saving, create } = useCreate(fields, members);
  const problem = nameProblem(fields.name);
  return (
    <Screen
      header={<PageHeader title="New channel" breadcrumbs={CRUMBS} />}
      maxWidth="reading"
      footer={
        <CreateBar
          saving={saving}
          ready={problem === null && members.length > 0}
          onCreate={create}
        />
      }
    >
      <ChannelFieldsBlock
        fields={fields}
        onChange={(change) => {
          setFields((current) => ({ ...current, ...change }));
        }}
        nameError={fields.name === '' ? null : problem}
      />
      <ChannelMembersBlock
        members={members}
        onChange={(change) => {
          void speakerAllowed(change).then((allowed) => {
            if (allowed) {
              setMembers((current) => applied(current, change));
            }
          });
        }}
      />
    </Screen>
  );
}

function memberSaved(channelId: string): (change: MemberChange) => void {
  return (change) => {
    void speakerAllowed(change).then((allowed) => {
      if (!allowed) {
        return;
      }
      const target = { channelId, kind: change.kind, memberId: change.memberId };
      (change.member ? setTalkMember(target, change.listening) : removeTalkMember(target)).catch(
        failed('The member wasn’t changed'),
      );
    });
  };
}

async function deleteChannel(channel: TalkChannelRow): Promise<void> {
  const accepted = await confirm({
    title: `Delete ${channel.name}?`,
    body: 'Its saved messages are deleted too.',
    confirmLabel: 'Delete',
    tone: 'destructive',
  });
  if (accepted) {
    await removeTalkChannel(channel.id);
    router.back();
  }
}

function ExistingChannel({ channel }: { readonly channel: TalkChannelRow }): ReactNode {
  const [name, setName] = useState(channel.name);
  const members = draftMembersOf(useChannelMembers(channel.id));
  const problem = nameProblem(name);
  const save = (change: Partial<ChannelFields>): void => {
    updateTalkChannel(channel.id, change).catch(failed('The channel wasn’t changed'));
  };
  return (
    <Screen header={<PageHeader title={channel.name} breadcrumbs={CRUMBS} />} maxWidth="reading">
      <ChannelFieldsBlock
        fields={{ ...fieldsOf(channel), name }}
        nameError={problem}
        onChange={(change) => {
          if (change.name === undefined) {
            save(change);
          } else {
            setName(change.name);
          }
        }}
        onNameDone={() => {
          if (problem === null && name !== channel.name) {
            save({ name });
          }
        }}
      />
      <ChannelMembersBlock members={members} onChange={memberSaved(channel.id)} />
      <List inset>
        <ActionRow
          title="Delete channel"
          icon="trash"
          destructive
          onPress={() => {
            deleteChannel(channel).catch(failed('The channel wasn’t deleted'));
          }}
        />
      </List>
    </Screen>
  );
}

function ChannelById({ channelId }: { readonly channelId: string }): ReactNode {
  const channel = useRow('talk_channels', channelId);
  if (channel === null) {
    return (
      <Screen header={<PageHeader title="Channel" breadcrumbs={CRUMBS} />} maxWidth="reading">
        <EmptyState icon="radio" title="Channel not found" body="It may have been deleted." />
      </Screen>
    );
  }
  return <ExistingChannel channel={channel} />;
}

export function ChannelEditorScreen(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  if (!params.success || params.data.channelId === 'new') {
    return <NewChannel />;
  }
  return <ChannelById channelId={params.data.channelId} />;
}
