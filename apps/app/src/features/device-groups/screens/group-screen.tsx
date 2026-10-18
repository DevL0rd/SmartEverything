import type { ReactNode } from 'react';
import { useState } from 'react';
import { router } from 'expo-router';
import type { DeviceGroupRow, DeviceTarget } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { useDevices, useRoom } from '../../../store/selectors';
import { useAutomationUses } from '../data/use-automation-uses';
import type { EditorResult } from '../data/use-group-draft';
import { GroupEditor } from '../group-editor';
import type { GroupPageParams } from '../model/route-params';
import { useTargetMembers } from '../use-target-members';
import { useGroupLoad, type GroupData } from '../widget/use-group-data';
import { GroupEmpty, GroupGone, GroupLoading } from './group-states';
import { GroupPage } from './group-page';
import { pageMenu, type AddToHome } from './group-menu';

function leaveWhenRemoved(result: EditorResult): void {
  if (result.kind === 'removed') router.replace(href.devices());
}

function EmptyGroup({
  data,
  group,
  roomName,
  edit,
  addToHome,
}: {
  readonly data: GroupData;
  readonly group: DeviceGroupRow | null;
  readonly roomName: string | null;
  readonly edit: boolean;
  readonly addToHome: AddToHome;
}): ReactNode {
  const devices = useDevices({ includeHidden: true });
  const uses = useAutomationUses(data.target);
  const [adding, setAdding] = useState(edit);
  const menu = pageMenu({
    target: data.target,
    group,
    uses: uses.map((use) => use.name),
    onEdit: () => {
      setAdding(true);
    },
    addToHome,
  });
  return (
    <>
      <GroupEmpty
        title={data.name}
        roomName={roomName}
        menu={menu}
        onAdd={() => {
          setAdding(true);
        }}
      />
      {adding && group !== null ? (
        <GroupEditor
          group={group}
          devices={devices}
          onClose={(result) => {
            setAdding(false);
            leaveWhenRemoved(result);
          }}
        />
      ) : null}
    </>
  );
}

function Loaded({
  data,
  target,
  params,
  addToHome,
}: {
  readonly data: GroupData;
  readonly target: DeviceTarget;
  readonly params: GroupPageParams;
  readonly addToHome: AddToHome;
}): ReactNode {
  const found = useTargetMembers(target);
  const room = useRoom(target.kind === 'room' ? target.roomId : null);
  const group = found.status === 'ready' ? found.group : null;
  if (data.members.length === 0)
    return (
      <EmptyGroup
        data={data}
        group={group}
        roomName={room?.name ?? null}
        edit={params.edit}
        addToHome={addToHome}
      />
    );
  return (
    <GroupPage
      data={data}
      group={group}
      params={params}
      onEdited={leaveWhenRemoved}
      addToHome={addToHome}
    />
  );
}

export function GroupScreen({
  target,
  params,
  addToHome,
}: {
  readonly target: DeviceTarget;
  readonly params: GroupPageParams;
  readonly addToHome: AddToHome;
}): ReactNode {
  const load = useGroupLoad(target, undefined);
  const room = useRoom(target.kind === 'room' ? target.roomId : null);
  const isRoom = target.kind === 'room';
  if (load.status === 'loading') return <GroupLoading title={isRoom ? 'Room lights' : 'Group'} />;
  if (load.status === 'removed' || (isRoom && room === null)) return <GroupGone room={isRoom} />;
  return <Loaded data={load.data} target={target} params={params} addToHome={addToHome} />;
}
