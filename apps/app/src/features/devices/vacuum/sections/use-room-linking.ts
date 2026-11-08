import { useState } from 'react';
import { background } from '@smarteverything/logging';
import type { VacuumRoomLinks, VacuumStaleRoomLink } from '@smarteverything/domain';
import { confirm } from '../../../../components/confirm-store';
import type { LinkChange } from '../data/room-link-calls';
import { useVacuumRoomLinks } from '../data/room-links-query';
import { linkChoicesOf, moveBody, type LinkChoices } from '../model/room-links';
import type { LinkChoice } from './room-link-picker';

export interface RoomLinking {
  readonly links: VacuumRoomLinks | null;
  readonly failure: Error | null;
  readonly retry: () => void;
  readonly busyRoom: number | null;
  readonly choices: LinkChoices | null;
  readonly open: (mapRoomId: number) => void;
  readonly close: () => void;
  readonly choose: (choices: LinkChoices, choice: LinkChoice) => void;
  readonly removeStale: (link: VacuumStaleRoomLink) => void;
}

async function changeOf(choices: LinkChoices, choice: LinkChoice): Promise<LinkChange | null> {
  const base = { mapRoomId: choices.room.mapRoomId, mapRoomName: choices.room.mapRoomName };
  switch (choice.kind) {
    case 'create':
      return { kind: 'create', ...base };
    case 'unlink':
      return { kind: 'unlink', ...base };
    case 'suggestion':
      return { kind: 'link', ...base, roomId: choice.room.id, move: false };
    case 'room':
      break;
  }
  const { row } = choice;
  if (row.current) {
    return null;
  }
  if (row.usedBy === null) {
    return { kind: 'link', ...base, roomId: row.room.id, move: false };
  }
  const accepted = await confirm({
    title: `Move ${row.room.name} to “${base.mapRoomName}”?`,
    body: moveBody(row.room.name, row.usedBy),
    confirmLabel: 'Move link',
  });
  return accepted ? { kind: 'link', ...base, roomId: row.room.id, move: true } : null;
}

export function useRoomLinking(deviceId: string, mapVersion: string): RoomLinking {
  const state = useVacuumRoomLinks(deviceId, mapVersion);
  const [openId, setOpenId] = useState<number | null>(null);
  const { links, change } = state;
  const choose = async (choices: LinkChoices, choice: LinkChoice): Promise<void> => {
    setOpenId(null);
    const picked = await changeOf(choices, choice);
    if (picked !== null) {
      change(picked);
    }
  };
  return {
    links,
    failure: state.failure,
    retry: state.retry,
    busyRoom: state.busyRoom,
    choices: links === null || openId === null ? null : linkChoicesOf(links, openId),
    open: setOpenId,
    close: (): void => {
      setOpenId(null);
    },
    choose: (choices, choice): void => {
      background(choose(choices, choice), 'vacuum.room_link_choice_failed', { deviceId });
    },
    removeStale: (link): void => {
      change({ kind: 'unlink', mapRoomId: link.mapRoomId, mapRoomName: link.mapRoomName });
    },
  };
}
