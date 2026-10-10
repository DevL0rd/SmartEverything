import type { ReactNode } from 'react';
import { isCamera, type TalkMemberKind } from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useDevices, useRows } from '../../../store/selectors';
import { platformIcon } from '../../settings';
import { memberKey, type DraftMember } from './channel-draft';

export interface MemberChange {
  readonly kind: TalkMemberKind;
  readonly memberId: string;
  readonly member: boolean;
  readonly listening: boolean;
}

export interface ChannelMembersProps {
  readonly members: readonly DraftMember[];
  readonly onChange: (change: MemberChange) => void;
}

function lookup(members: readonly DraftMember[]): ReadonlyMap<string, DraftMember> {
  return new Map(members.map((member) => [memberKey(member.kind, member.memberId), member]));
}

function DeviceRows({ members, onChange }: ChannelMembersProps): ReactNode {
  const clients = useRows('clients');
  const byKey = lookup(members);
  return (
    <List title="Phones and computers" inset>
      {clients.map((client) => (
        <SwitchRow
          key={client.id}
          title={client.name}
          icon={platformIcon(client.platform)}
          value={byKey.has(memberKey('client', client.id))}
          onChange={(member) => {
            onChange({ kind: 'client', memberId: client.id, member, listening: true });
          }}
        />
      ))}
    </List>
  );
}

function CameraRows({ members, onChange }: ChannelMembersProps): ReactNode {
  const cameras = useDevices().filter(isCamera);
  const byKey = lookup(members);
  if (cameras.length === 0) {
    return null;
  }
  return (
    <List
      title="Cameras"
      footer="Members can listen to a camera. A camera plays the channel only if you turn its speaker on; everyone near it will hear."
      inset
    >
      {cameras.flatMap((camera) => {
        const current = byKey.get(memberKey('camera', camera.id));
        const join = (
          <SwitchRow
            key={camera.id}
            title={camera.label}
            icon="camera"
            value={current !== undefined}
            onChange={(member) => {
              onChange({ kind: 'camera', memberId: camera.id, member, listening: false });
            }}
          />
        );
        return current === undefined
          ? [join]
          : [
              join,
              <SwitchRow
                key={`${camera.id}/speaker`}
                title="Play the channel on its speaker"
                value={current.listening}
                onChange={(listening) => {
                  onChange({ kind: 'camera', memberId: camera.id, member: true, listening });
                }}
              />,
            ];
      })}
    </List>
  );
}

export function ChannelMembersBlock(props: ChannelMembersProps): ReactNode {
  return (
    <>
      <DeviceRows {...props} />
      <CameraRows {...props} />
    </>
  );
}
