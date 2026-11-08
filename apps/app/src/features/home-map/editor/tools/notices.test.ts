import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  HOME_MAP_WRITE,
  type HomeMap,
  type HomeMapNotice,
} from '@smarteverything/domain';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());
const calls = vi.hoisted(() => new Array<{ endpoint: unknown; request: unknown }>());
const cache = vi.hoisted(() => ({ revision: 3, refetched: 0 }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual<object>('@tanstack/react-query')),
  useQueryClient: (): object => ({
    getQueryData: (): object => ({ revision: cache.revision }),
  }),
}));
vi.mock('../../data/home-map-query', () => ({
  homeMapQueryKey: (): readonly string[] => ['map'],
  refetchHomeMap: (): Promise<void> => {
    cache.refetched += 1;
    return Promise.resolve();
  },
}));
vi.mock('../../../../api/transport', () => ({
  api: (): { call: (endpoint: unknown, request: unknown) => Promise<unknown> } => ({
    call: (endpoint, request): Promise<unknown> => {
      calls.push({ endpoint, request });
      return Promise.resolve({ revision: 4 });
    },
  }),
}));

const { HomeMapNotices, ROBOT_REACH, catchUpTo, noticeChoices, resolveNotice, roomNameOf } =
  await import('./notices');

const FLOOR_ID = '00000000-0000-4000-8000-0000000000f1';
const ROOM_ID = '00000000-0000-4000-8000-00000000000a';
const SOURCE_ID = '00000000-0000-4000-8000-0000000000s1';

function notice(kind: string, detail: string, elementId = ROOM_ID): object {
  return { id: `n-${kind}`, kind, elementId, detail, createdAt: '2026-10-25T00:00:00.000Z' };
}

const MAP: HomeMap = HOME_MAP_WRITE.parse({
  schemaVersion: 1,
  id: 'home',
  name: 'Test house',
  revision: 3,
  updatedAt: '2026-10-25T00:00:00.000Z',
  north: 0,
  floors: [
    {
      id: FLOOR_ID,
      name: 'Ground',
      level: 0,
      elevation: 0,
      ceilingHeight: 2.6,
      rooms: [
        {
          id: ROOM_ID,
          name: 'Kitchen',
          homeRoomId: null,
          polygon: {
            outer: [
              { x: 0, y: 0 },
              { x: 3, y: 0 },
              { x: 3, y: 3 },
            ],
            holes: [],
          },
          labelAt: { x: 2, y: 1 },
          colourSlot: 1,
          floorMaterial: { kind: 'tile', variant: 'small', tint: null },
          wallPaint: null,
          ceilingHeight: null,
          origin: { kind: 'hand' },
        },
      ],
      walls: [],
      openings: [],
      objects: [],
      placements: [],
      annotations: [],
    },
  ],
  sources: [],
  notices: [
    notice('source_changed', "The robot's shape of Kitchen changed."),
    notice('source_moved', "The robot's map moved.", SOURCE_ID),
  ],
});

function render(readOnly: boolean, onAlign: (id: string) => void = vi.fn()): void {
  seen.length = 0;
  renderToStaticMarkup(createElement(HomeMapNotices, { map: MAP, readOnly, onAlign }));
}

function buttons(): Props[] {
  return seen.filter((item) => item.kind === 'Button').map((item) => item.props);
}

describe('notice choices', () => {
  it('offers the actions the hub accepts for each notice kind', () => {
    const actions = (kind: HomeMapNotice['kind'], detail = ''): string[] =>
      noticeChoices({ kind, detail }).map((choice) => choice.action);
    expect(actions('source_changed', "The robot's shape changed")).toEqual([
      'use_source',
      'keep_mine',
    ]);
    expect(actions('source_changed', 'The robot split Kitchen into 2 rooms.')).toEqual([
      'split_like_source',
      'keep_mine',
    ]);
    expect(actions('source_missing')).toEqual(['keep_mine', 'delete']);
    expect(actions('source_moved')).toEqual(['align', 'keep_mine']);
    expect(actions('source_new_robot_map')).toEqual(['align', 'keep_mine']);
    expect(actions('link_stale')).toEqual(['keep_mine']);
  });

  it('names the room a notice is about', () => {
    expect(roomNameOf(MAP, ROOM_ID)).toBe('Kitchen');
    expect(roomNameOf(MAP, SOURCE_ID)).toBeNull();
  });
});

describe('notices panel', () => {
  it('draws one card per notice with its action buttons', () => {
    render(false);
    expect(buttons().map((props) => props['label'])).toEqual([
      "Use the robot's shape",
      'Keep mine',
      'Align with two points',
      'Dismiss',
    ]);
    expect(buttons().every((props) => props['disabled'] === false)).toBe(true);
  });

  it('pauses every action while offline', () => {
    render(true);
    expect(buttons().every((props) => props['disabled'] === true)).toBe(true);
  });

  it('opens the two-point align for the moved source', () => {
    const onAlign = vi.fn();
    render(false, onAlign);
    const align = buttons().find((props) => props['label'] === 'Align with two points');
    const press: unknown = align?.['onPress'];
    if (typeof press !== 'function') throw new Error('no align button');
    Reflect.apply(press, undefined, []);
    expect(onAlign).toHaveBeenCalledWith(SOURCE_ID);
    expect(calls).toHaveLength(0);
  });
});

describe('resolving a notice', () => {
  it('sends the action to the hub and catches up only when the map is behind', async () => {
    const revision = await resolveNotice(MAP.id, 'n-1', 'use_source');
    expect(revision).toBe(4);
    expect(calls.at(-1)).toEqual({
      endpoint: E.resolveHomeMapNotice,
      request: {
        params: { noticeId: 'n-1' },
        body: { action: 'use_source' },
        query: { mapId: 'home' },
      },
    });
    const client = new QueryClient();
    client.setQueryData(['map'], { ...MAP, revision: 4 });
    await catchUpTo(client, undefined, 4);
    expect(cache.refetched).toBe(0);
    await catchUpTo(client, undefined, 5);
    expect(cache.refetched).toBe(1);
  });
});

describe('what reaches the robot', () => {
  it('lists what is sent and what never leaves the map', () => {
    expect(ROBOT_REACH.sends.join(' ')).toMatch(/no-go/);
    expect(ROBOT_REACH.sends.join(' ')).toMatch(/Floor material/);
    expect(ROBOT_REACH.never.join(' ')).toMatch(/Walls/);
    expect(ROBOT_REACH.never.join(' ')).toMatch(/Furniture/);
    expect(ROBOT_REACH.never.join(' ')).toMatch(/splits and merges/);
  });
});
