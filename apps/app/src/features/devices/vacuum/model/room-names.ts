import type { VacuumSceneAnswer } from '@smarteverything/domain';

type SceneRoom = VacuumSceneAnswer['rooms'][number];

export interface ShownRoom extends SceneRoom {
  readonly robotName: string;
  readonly homeRoomId: string | null;
}

export type ShownScene = Omit<VacuumSceneAnswer, 'rooms'> & { readonly rooms: ShownRoom[] };

export interface HomeRoomName {
  readonly id: string;
  readonly name: string;
}

function shownRoom(room: SceneRoom, names: ReadonlyMap<string, string>): ShownRoom {
  const home = room.homeRoom ?? null;
  if (home === null) {
    return { ...room, robotName: room.name, homeRoomId: null };
  }
  return {
    ...room,
    name: names.get(home.id) ?? home.name,
    robotName: room.name,
    homeRoomId: home.id,
  };
}

export function shownSceneOf(
  scene: VacuumSceneAnswer,
  homeRooms: readonly HomeRoomName[],
): ShownScene {
  const names = new Map(homeRooms.map((room) => [room.id, room.name]));
  return { ...scene, rooms: scene.rooms.map((room) => shownRoom(room, names)) };
}
