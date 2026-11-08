import { describe, expect, it } from 'vitest';
import { isoHouse, isoRoom } from '../../../components/house-map/iso/iso-fixture';
import type { RenderFloor } from '../../../components/house-map/render-scene';
import {
  HERO_PHONE_MAX_HEIGHT,
  HERO_WIDE_ASPECT,
  HERO_WIDE_MAX_HEIGHT,
  heroFloorOf,
  heroFrameStyle,
  heroMapNotices,
  heroPickTarget,
  heroTapTarget,
  heroViewFacts,
  madeFromRobot,
  mapHasContent,
} from './hero';

const floor: RenderFloor = {
  ...isoHouse(),
  rooms: [{ ...isoRoom('kitchen-shape', 0, 4), homeRoomId: 'room-kitchen' }, isoRoom('hall', 4, 6)],
};

function mapOf(rooms: number): {
  readonly floors: readonly { readonly rooms: readonly unknown[] }[];
} {
  return { floors: [{ rooms: [] }, { rooms: Array.from({ length: rooms }, (_, index) => index) }] };
}

describe('Home map hero', () => {
  it('sends a room tap to Devices with the linked hub room selected', () => {
    expect(heroTapTarget(floor, { kind: 'room', id: 'kitchen-shape' })).toStrictEqual({
      pathname: '/devices',
      params: { room: 'room-kitchen' },
    });
  });

  it('sends a device tap to Devices with that device selected', () => {
    expect(heroTapTarget(floor, { kind: 'device', id: 'lamp-1' })).toStrictEqual({
      pathname: '/devices',
      params: { device: 'lamp-1' },
    });
  });

  it('does nothing for a room without a hub room, an unknown room, or a wall or empty space', () => {
    expect(heroTapTarget(floor, { kind: 'room', id: 'hall' })).toBeNull();
    expect(heroTapTarget(floor, { kind: 'room', id: 'gone' })).toBeNull();
    expect(heroTapTarget(floor, { kind: 'none' })).toBeNull();
    expect(heroTapTarget(floor, { kind: 'wall', id: 'w', offset: 0 })).toBeNull();
  });

  it('is min(56 percent of the window, 520 px) high on phones', () => {
    expect(heroFrameStyle(true, 800)).toStrictEqual({ height: 448 });
    expect(heroFrameStyle(true, 1200)).toStrictEqual({ height: HERO_PHONE_MAX_HEIGHT });
  });

  it('fills the content width like the cards below, 16:9 and at most 560 px high, on tablet and desktop', () => {
    const style = heroFrameStyle(false, 900);
    expect(style).toStrictEqual({
      width: '100%',
      aspectRatio: HERO_WIDE_ASPECT,
      maxHeight: HERO_WIDE_MAX_HEIGHT,
    });
    expect(style).not.toHaveProperty('maxWidth');
    expect(style).not.toHaveProperty('alignSelf');
  });

  it('can reserve one control height for the dashboard below the inline map', () => {
    expect(heroFrameStyle(true, 700, 48)).toStrictEqual({ height: 344 });
    expect(heroFrameStyle(false, 900, 48)).toMatchObject({ maxHeight: 512 });
  });

  it('counts a map as made only when a floor has rooms', () => {
    expect(mapHasContent(null)).toBe(false);
    expect(mapHasContent(mapOf(0))).toBe(false);
    expect(mapHasContent(mapOf(2))).toBe(true);
  });

  it('marks a map fed by a robot and turns its notices into chips that open the editor', () => {
    let edits = 0;
    const map = {
      sources: [{ id: 's1' }],
      notices: [{ detail: 'Kitchen lost its link' }],
    };
    expect(madeFromRobot(map)).toBe(true);
    expect(madeFromRobot({ sources: [], notices: [] })).toBe(false);
    expect(madeFromRobot(null)).toBe(false);
    const [notice] = heroMapNotices(map, () => {
      edits += 1;
    });
    expect(notice?.text).toBe('Kitchen lost its link');
    notice?.onPress?.();
    expect(edits).toBe(1);
  });
});

describe('Home map hero views and floors', () => {
  it('sends a room picked in 3D to Devices and ignores empty picks', () => {
    expect(heroPickTarget(floor, 'kitchen-shape')).toStrictEqual({
      pathname: '/devices',
      params: { room: 'room-kitchen' },
    });
    expect(heroPickTarget(floor, 'hall')).toBeNull();
    expect(heroPickTarget(floor, null)).toBeNull();
  });

  it('offers Realistic only when the map has a scan and a realistic body is given', () => {
    const scanned = { scan: { file: 'x' } };
    expect(heroViewFacts(scanned, true)).toEqual({ hasScan: true });
    expect(heroViewFacts(scanned, false)).toEqual({ hasScan: false });
    expect(heroViewFacts({}, true)).toEqual({ hasScan: false });
    expect(heroViewFacts(null, true)).toEqual({ hasScan: false });
  });

  it('shows the remembered floor and the first floor when none or a gone one is remembered', () => {
    const floors = [{ id: 'ground' }, { id: 'upper' }];
    expect(heroFloorOf(floors, 'upper')).toEqual({ id: 'upper' });
    expect(heroFloorOf(floors, null)).toEqual({ id: 'ground' });
    expect(heroFloorOf(floors, 'gone')).toEqual({ id: 'ground' });
    expect(heroFloorOf([], null)).toBeNull();
  });
});
