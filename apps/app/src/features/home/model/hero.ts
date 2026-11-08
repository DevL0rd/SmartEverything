import type { AppHref } from '../../../components/app-href';
import type { ViewStyle } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import type { ScenePick } from '../../../components/house-map/3d/render-core-pick';
import type { RenderFloor } from '../../../components/house-map/render-scene';
import type { StageMapFacts, StageMapNotice } from '../../home-map';

export const HOME_MAP_EDITOR: AppHref = '/home-map/edit';

export const HERO_PHONE_SHARE = 0.56;
export const HERO_PHONE_MAX_HEIGHT = 520;
export const HERO_WIDE_MAX_HEIGHT = 560;
export const HERO_WIDE_ASPECT = 16 / 9;

export function heroFrameStyle(phone: boolean, windowHeight: number, reserve = 0): ViewStyle {
  if (phone) {
    return {
      height:
        Math.round(Math.min(windowHeight * HERO_PHONE_SHARE, HERO_PHONE_MAX_HEIGHT)) - reserve,
    };
  }
  return {
    width: '100%',
    aspectRatio: HERO_WIDE_ASPECT,
    maxHeight: HERO_WIDE_MAX_HEIGHT - reserve,
  };
}

export function heroTapTarget(floor: RenderFloor, pick: ScenePick): AppHref | null {
  if (pick.kind === 'device') return href.devicesSelection({ device: pick.id });
  if (pick.kind !== 'room') return null;
  const homeRoomId = floor.rooms.find((room) => room.id === pick.id)?.homeRoomId ?? null;
  return homeRoomId === null ? null : href.devicesSelection({ room: homeRoomId });
}

export const HERO_PAGE = 'home';

export function heroPickTarget(floor: RenderFloor, roomId: string | null): AppHref | null {
  return roomId === null ? null : heroTapTarget(floor, { kind: 'room', id: roomId });
}

export function heroViewFacts(
  map: { readonly scan?: unknown } | null,
  realisticOffered: boolean,
): StageMapFacts {
  return { hasScan: realisticOffered && map?.scan !== undefined };
}

export function heroFloorOf<F extends { readonly id: string }>(
  floors: readonly F[],
  lastFloorId: string | null,
): F | null {
  return floors.find((floor) => floor.id === lastFloorId) ?? floors[0] ?? null;
}

interface MapContent {
  readonly floors: readonly { readonly rooms: readonly unknown[] }[];
}

interface MapFeeds {
  readonly sources: readonly unknown[];
  readonly notices: readonly { readonly detail: string }[];
}

export function mapHasContent(map: MapContent | null): boolean {
  return map?.floors.some((floor) => floor.rooms.length > 0) === true;
}

export function madeFromRobot(map: MapFeeds | null): boolean {
  return (map?.sources.length ?? 0) > 0;
}

export function heroMapNotices(
  map: MapFeeds | null,
  onEdit: () => void,
): readonly StageMapNotice[] {
  return (map?.notices ?? []).map((notice) => ({ text: notice.detail, onPress: onEdit }));
}
