import {
  VACUUM_ROOM_LINKS_KEY,
  VACUUM_ROOM_LINKS_SUMMARY,
  VacuumValueError,
  type JsonValue,
  type VacuumHomeRoom,
  type VacuumHomeRoomUse,
  type VacuumMapRoomLink,
  type VacuumRoomLinks,
  type VacuumRoomLinksSummary,
} from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';
import { plural } from '../../../../format/text';

const SUMMARY_EXPECTED = 'a JSON object with linked, unlinked and stale counts';

function summaryJson(text: JsonValue): unknown {
  if (typeof text !== 'string') {
    throw new VacuumValueError(VACUUM_ROOM_LINKS_KEY, SUMMARY_EXPECTED, text);
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new VacuumValueError(VACUUM_ROOM_LINKS_KEY, SUMMARY_EXPECTED, text, { cause });
  }
}

export function parseRoomLinksSummary(text: JsonValue | undefined): VacuumRoomLinksSummary | null {
  if (text === undefined || text === '') {
    return null;
  }
  const parsed = VACUUM_ROOM_LINKS_SUMMARY.safeParse(summaryJson(text));
  if (!parsed.success) {
    throw new VacuumValueError(VACUUM_ROOM_LINKS_KEY, SUMMARY_EXPECTED, text);
  }
  return parsed.data;
}

export interface LinkNotice {
  readonly count: number;
  readonly title: string;
  readonly label: string;
}

const MAP_CHANGED = 'The robot’s map changed';

function changedNotice(summary: VacuumRoomLinksSummary): LinkNotice {
  if (summary.unlinked > 0) {
    const rooms = plural(summary.unlinked, 'room');
    return {
      count: summary.unlinked,
      title: `${MAP_CHANGED}. ${rooms} to link`,
      label: `${MAP_CHANGED}. ${rooms} to link. Link rooms`,
    };
  }
  const links = plural(summary.stale, 'link');
  return {
    count: summary.stale,
    title: `${MAP_CHANGED}. ${links} to check`,
    label: `${links} to check. Link rooms`,
  };
}

export function linkNoticeOf(summary: VacuumRoomLinksSummary | null): LinkNotice | null {
  if (summary === null) {
    return null;
  }
  if (summary.stale > 0) {
    return changedNotice(summary);
  }
  if (summary.unlinked > 0) {
    const rooms = plural(summary.unlinked, 'room');
    return {
      count: summary.unlinked,
      title:
        summary.unlinked === 1
          ? '1 room isn’t linked to your home'
          : `${rooms} aren’t linked to your home`,
      label: `${rooms} to link. Link rooms`,
    };
  }
  return null;
}

export interface PickerRow {
  readonly room: VacuumHomeRoom;
  readonly current: boolean;
  readonly usedBy: string | null;
}

export function pickerRowsOf(
  homeRooms: readonly VacuumHomeRoomUse[],
  mapRoomId: number,
): readonly PickerRow[] {
  return homeRooms.map((room) => {
    const holder = room.usedBy;
    const mine = holder !== null && holder.mapRoomId === mapRoomId;
    return {
      room: { id: room.id, name: room.name },
      current: mine,
      usedBy: holder === null || mine ? null : holder.mapRoomName,
    };
  });
}

export interface LinkChoices {
  readonly room: VacuumMapRoomLink;
  readonly suggestion: VacuumHomeRoom | null;
  readonly rows: readonly PickerRow[];
}

function freeSuggestion(links: VacuumRoomLinks, room: VacuumMapRoomLink): VacuumHomeRoom | null {
  const { suggestion } = room;
  if (room.homeRoom !== null || suggestion === null) {
    return null;
  }
  const holder = links.homeRooms.find((home) => home.id === suggestion.id)?.usedBy ?? null;
  return holder === null ? suggestion : null;
}

export function linkChoicesOf(links: VacuumRoomLinks, mapRoomId: number): LinkChoices | null {
  const room = links.rooms.find((entry) => entry.mapRoomId === mapRoomId);
  if (room === undefined) {
    return null;
  }
  const suggestion = freeSuggestion(links, room);
  return {
    room,
    suggestion,
    rows: pickerRowsOf(links.homeRooms, mapRoomId).filter((row) => row.room.id !== suggestion?.id),
  };
}

export interface LinkField {
  readonly icon: IconName;
  readonly text: string;
  readonly label: string;
  readonly linked: boolean;
}

export function linkFieldOf(room: VacuumMapRoomLink, hasHomeRooms: boolean): LinkField {
  const home = room.homeRoom;
  if (home !== null) {
    return {
      icon: 'circleCheck',
      text: 'Linked',
      label: `${room.mapRoomName} is linked to ${home.name}. Change the home room`,
      linked: true,
    };
  }
  const text = hasHomeRooms ? 'Pick a home room' : 'Create a home room';
  return {
    icon: hasHomeRooms ? 'unlink' : 'plus',
    text,
    label: `${text} for ${room.mapRoomName}`,
    linked: false,
  };
}

function holderWords(room: string, holder: string): string {
  return holder === room ? 'another map room' : `the map room ${holder}`;
}

export function holderLine(room: string, holder: string): string {
  return `Linked to ${holderWords(room, holder)}`;
}

export function moveBody(room: string, holder: string): string {
  const words = holderWords(room, holder);
  return `${room} is linked to ${words} already. A room in your home links to one map room. If you move it, ${words} becomes unlinked.`;
}
