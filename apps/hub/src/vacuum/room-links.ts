import {
  ApiError,
  VACUUM_ROOM_LINKS_SUMMARY,
  type JsonValue,
  type RoomRow,
  type VacuumHomeRoom,
  type VacuumHomeRoomUse,
  type VacuumRoomLinks as RoomLinksAnswer,
  type VacuumRoomLinksSummary,
  type VacuumScene,
  type VacuumSceneAnswer,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type {
  MapRoomName,
  RoomLinkDraft,
  StoredRoomLink,
} from '../store/repositories/vacuum-room-links';
import type { StoreHost } from '../store/host/host';
import { suggestHomeRooms } from './room-suggestions';

export interface RoomLinkStore {
  readonly list: (deviceId: string) => Promise<StoredRoomLink[]>;
  readonly link: (deviceId: string, draft: RoomLinkDraft) => Promise<void>;
  readonly unlink: (deviceId: string, mapRoomId: number) => Promise<boolean>;
  readonly reconcile: (
    deviceId: string,
    rooms: readonly MapRoomName[],
    at: string,
  ) => Promise<number>;
}

export function hostRoomLinks(host: Pick<StoreHost, 'call'>): RoomLinkStore {
  return {
    list: (deviceId) => host.call('vacuumRoomLinks', 'list', deviceId),
    link: (deviceId, draft) => host.call('vacuumRoomLinks', 'link', deviceId, draft),
    unlink: (deviceId, mapRoomId) => host.call('vacuumRoomLinks', 'unlink', deviceId, mapRoomId),
    reconcile: (deviceId, rooms, at) =>
      host.call('vacuumRoomLinks', 'reconcile', deviceId, rooms, at),
  };
}

export interface RoomLinkPorts {
  readonly links: RoomLinkStore;
  readonly rooms: { readonly list: () => RoomRow[] };
  readonly scene: (deviceId: string) => VacuumScene | undefined;
  readonly stored: (deviceId: string) => JsonValue | undefined;
  readonly publish: (deviceId: string, text: string) => void;
  readonly log: Logger;
}

export interface RoomLinkRequest {
  readonly mapRoomId: number;
  readonly roomId: string;
  readonly move: boolean;
}

type StaleLink = StoredRoomLink & { readonly missingSince: string };

interface Linking {
  readonly present: ReadonlyMap<number, StoredRoomLink>;
  readonly stale: readonly StaleLink[];
}

const homeOf = (link: StoredRoomLink): VacuumHomeRoom => ({ id: link.roomId, name: link.roomName });

function linkingOf(links: readonly StoredRoomLink[]): Linking {
  return {
    present: new Map(
      links.flatMap((link) =>
        link.missingSince === null ? [[link.mapRoomId, link] as const] : [],
      ),
    ),
    stale: links.flatMap((link) =>
      link.missingSince === null ? [] : [{ ...link, missingSince: link.missingSince }],
    ),
  };
}

function usesOf(rooms: readonly RoomRow[], links: readonly StoredRoomLink[]): VacuumHomeRoomUse[] {
  const byRoom = new Map(links.map((link) => [link.roomId, link]));
  return rooms.map((room) => {
    const link = byRoom.get(room.id);
    return {
      id: room.id,
      name: room.name,
      usedBy:
        link === undefined
          ? null
          : {
              mapRoomId: link.mapRoomId,
              mapRoomName: link.mapRoomName,
              stale: link.missingSince !== null,
            },
    };
  });
}

export function roomLinksSummary(
  scene: VacuumScene | undefined,
  links: readonly StoredRoomLink[],
): VacuumRoomLinksSummary {
  const { present, stale } = linkingOf(links);
  const rooms = scene?.rooms ?? [];
  const linked = rooms.filter((room) => present.has(room.id)).length;
  return { linked, unlinked: rooms.length - linked, stale: stale.length };
}

function revisionOf(stored: JsonValue | undefined, log: Logger): number {
  if (typeof stored !== 'string') return 0;
  try {
    const parsed = VACUUM_ROOM_LINKS_SUMMARY.safeParse(JSON.parse(stored));
    return parsed.success ? (parsed.data.revision ?? 0) : 0;
  } catch (error) {
    log.warn('vacuum_room_links.stored_unreadable', { error: String(error) });
    return 0;
  }
}

const fingerprintOf = (links: readonly StoredRoomLink[]): string =>
  JSON.stringify(
    links.map((link) => [
      link.mapRoomId,
      link.mapRoomName,
      link.roomId,
      link.roomName,
      link.missingSince,
    ]),
  );

export class VacuumRoomLinks {
  private readonly fingerprints = new Map<string, string>();
  private readonly turns = new Map<string, Promise<void>>();

  constructor(private readonly ports: RoomLinkPorts) {}

  sceneChanged(deviceId: string, scene: VacuumScene): void {
    if (scene.slot !== 'current') return;
    this.inOrder(deviceId, () => this.reconciled(deviceId, scene));
  }

  attached(deviceId: string): void {
    const scene = this.ports.scene(deviceId);
    if (scene === undefined) this.publish(deviceId);
    else this.sceneChanged(deviceId, scene);
  }

  settled(deviceId: string): Promise<void> {
    return this.turns.get(deviceId) ?? Promise.resolve();
  }

  async list(deviceId: string, scene: VacuumScene): Promise<RoomLinksAnswer> {
    return this.answer(scene, await this.ports.links.list(deviceId));
  }

  async link(
    deviceId: string,
    scene: VacuumScene,
    request: RoomLinkRequest,
  ): Promise<RoomLinksAnswer> {
    const mapRoom = scene.rooms.find((room) => room.id === request.mapRoomId);
    if (mapRoom === undefined) {
      throw new ApiError('not_found', `The robot's map has no room ${String(request.mapRoomId)}.`);
    }
    const room = this.ports.rooms.list().find((row) => row.id === request.roomId);
    if (room === undefined) {
      throw new ApiError('not_found', `The home has no room ${request.roomId}.`);
    }
    const holder = (await this.ports.links.list(deviceId)).find(
      (link) => link.roomId === room.id && link.mapRoomId !== mapRoom.id,
    );
    if (holder !== undefined && !request.move) {
      throw new ApiError(
        'conflict',
        `${room.name} is linked to ${holder.mapRoomName} already. Send move true to move the link; ${holder.mapRoomName} becomes unlinked.`,
      );
    }
    await this.ports.links.link(deviceId, {
      mapRoomId: mapRoom.id,
      mapRoomName: mapRoom.name,
      roomId: room.id,
    });
    this.ports.log.info('vacuum_room_link.linked', {
      deviceId,
      mapRoomId: mapRoom.id,
      moved: holder !== undefined,
    });
    this.publish(deviceId);
    return this.list(deviceId, scene);
  }

  async unlink(deviceId: string, scene: VacuumScene, mapRoomId: number): Promise<RoomLinksAnswer> {
    if (!(await this.ports.links.unlink(deviceId, mapRoomId))) {
      throw new ApiError('not_found', `Map room ${String(mapRoomId)} is not linked.`);
    }
    this.ports.log.info('vacuum_room_link.unlinked', { deviceId, mapRoomId });
    this.publish(deviceId);
    return this.list(deviceId, scene);
  }

  async decorate(deviceId: string, scene: VacuumScene): Promise<VacuumSceneAnswer> {
    const { present } = linkingOf(await this.ports.links.list(deviceId));
    const rooms = scene.rooms.map((room) => {
      const link = present.get(room.id);
      return { ...room, homeRoom: link === undefined ? null : homeOf(link) };
    });
    return {
      ...scene,
      rooms,
      unlinkedRooms: rooms.filter((room) => room.homeRoom === null).length,
    };
  }

  publish(deviceId: string): void {
    this.inOrder(deviceId, () => this.published(deviceId));
  }

  private inOrder(deviceId: string, work: () => Promise<void>): void {
    const next = (this.turns.get(deviceId) ?? Promise.resolve()).then(work);
    this.turns.set(
      deviceId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    background(next, 'vacuum_room_links.publish_failed', { deviceId });
  }

  private async reconciled(deviceId: string, scene: VacuumScene): Promise<void> {
    const changes = await this.ports.links.reconcile(deviceId, scene.rooms, scene.fetchedAt);
    if (changes > 0) {
      this.ports.log.info('vacuum_room_links.map_changed', { deviceId, changes });
    }
    await this.published(deviceId);
  }

  private answer(scene: VacuumScene, links: readonly StoredRoomLink[]): RoomLinksAnswer {
    const { present, stale } = linkingOf(links);
    const homeRooms = usesOf(this.ports.rooms.list(), links);
    const unlinked = scene.rooms.filter((room) => !present.has(room.id));
    const suggestions = suggestHomeRooms(
      unlinked,
      homeRooms.filter((room) => room.usedBy === null).map(({ id, name }) => ({ id, name })),
    );
    return {
      mapIndex: scene.index,
      rooms: scene.rooms.map((room) => {
        const link = present.get(room.id);
        return {
          mapRoomId: room.id,
          mapRoomName: room.name,
          colour: room.colour,
          areaM2: room.areaM2,
          homeRoom: link === undefined ? null : homeOf(link),
          suggestion: link === undefined ? (suggestions.get(room.id) ?? null) : null,
        };
      }),
      stale: stale.map((link) => ({
        mapRoomId: link.mapRoomId,
        mapRoomName: link.mapRoomName,
        homeRoom: homeOf(link),
        missingSince: link.missingSince,
      })),
      homeRooms,
      unlinked: unlinked.length,
    };
  }

  private async published(deviceId: string): Promise<void> {
    const links = await this.ports.links.list(deviceId);
    const fingerprint = fingerprintOf(links);
    const stored = this.ports.stored(deviceId);
    const previous = revisionOf(stored, this.ports.log);
    const summary = roomLinksSummary(this.ports.scene(deviceId), links);
    const known = this.fingerprints.get(deviceId);
    this.fingerprints.set(deviceId, fingerprint);
    const sameCounts = stored === JSON.stringify({ ...summary, revision: previous });
    if (sameCounts && (known === undefined || known === fingerprint)) return;
    this.ports.publish(deviceId, JSON.stringify({ ...summary, revision: previous + 1 }));
  }
}
