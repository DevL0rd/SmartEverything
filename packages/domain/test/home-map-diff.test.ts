import { describe, expect, it } from 'vitest';
import { HOME_MAP, type HomeMap } from '../src/home-map';
import { diffHomeMaps } from '../src/home-map-diff';
import { HOME_MAP_EDIT_BATCH, type HomeMapOp } from '../src/home-map-edit-ops';
import { applyHomeMapEdits, type HomeMapEditContext } from '../src/home-map-edits';

const HAND = { kind: 'hand' };
const SQUARE = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];
const USER: HomeMapEditContext = { actor: 'profile:alice', at: '2026-10-25T11:00:00.000Z' };
const ROBOT: HomeMapEditContext = { actor: 'source:robot', at: '2026-10-25T11:00:00.000Z' };
const DEVICES = [
  '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f',
  '9c1d7e52-1a0b-4f3e-9b6a-2d8e4c7f1a30',
  'b7d2a1c4-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
];

type Rec = Record<string, unknown>;

const room = (id: string, name: string | null): Rec => ({
  id,
  name,
  homeRoomId: null,
  polygon: { outer: SQUARE, holes: [] },
  labelAt: { x: 2, y: 1.5 },
  colourSlot: 1,
  floorMaterial: { kind: 'wood', variant: null, tint: null },
  wallPaint: null,
  ceilingHeight: null,
  origin: { kind: 'source', sourceId: 'robot', ref: `room:${id}`, overridden: [] },
});

const wall = (id: string, x: number): Rec => ({
  id,
  from: { x, y: 0 },
  to: { x: x + 4, y: 0 },
  thickness: 0.1,
  height: null,
  kind: 'solid',
  origin: HAND,
});

const opening = (id: string, wallId: string): Rec => ({
  id,
  wallId,
  offset: 1,
  width: 0.9,
  kind: 'door',
  sillHeight: 0,
  headHeight: 2.1,
  hinge: 'left',
  swing: 'in',
  opens: 'side_hung',
  contactDeviceId: null,
  lockDeviceId: null,
  origin: HAND,
});

const object = (id: string, x: number): Rec => ({
  id,
  modelId: 'cat.sofa.two_seat',
  finish: null,
  params: { width: 1.8 },
  at: { x, y: 1 },
  rotation: 0,
  elevation: 0,
  label: null,
  locked: false,
  style: 'plain',
  origin: HAND,
});

const placement = (deviceId: string, floorId: string): Rec => ({
  deviceId,
  floorId,
  at: { x: 2, y: 2 },
  rotation: 0,
  height: 2.4,
  tilt: 0,
  mount: 'ceiling',
  auto: true,
  camera: null,
});

const pin = (id: string, text: string): Rec => ({ id, kind: 'pin', at: { x: 1, y: 1 }, text });

const measure = (id: string): Rec => ({
  id,
  kind: 'measure',
  from: { x: 0, y: 0 },
  to: { x: 4, y: 0 },
  text: '4 m',
});

const source = (id: string, robotMapId: number | null): Rec => ({
  id,
  kind: 'xiaomi_vacuum',
  deviceId: DEVICES[0],
  ...(robotMapId === null ? {} : { robotMapId, robotMapName: 'Ground' }),
  floorId: 'floor-1',
  transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
  frame: { uid: 'u', name: null, boundsSignature: 'b' },
  lastVersion: 'v1',
  lastImportedAt: null,
  base: { rooms: [], walls: [], openings: [] },
  tombstones: [],
});

const notice = (id: string): Rec => ({
  id,
  kind: 'source_changed',
  elementId: 'room-1',
  detail: 'changed',
  createdAt: '2026-10-25T10:00:00.000Z',
});

const floor = (id: string, level: number, parts: Rec = {}): Rec => ({
  id,
  name: id,
  level,
  elevation: level * 2.7,
  ceilingHeight: 2.6,
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
  ...parts,
});

const document = (parts: Rec = {}): Rec => ({
  id: 'home',
  schemaVersion: 1,
  revision: 5,
  name: 'House',
  north: 0,
  updatedAt: '2026-10-25T10:00:00.000Z',
  sources: [source('robot', 3)],
  notices: [notice('n-1')],
  floors: [
    floor('floor-1', 0, {
      rooms: [room('room-1', null), room('room-2', 'Kitchen')],
      walls: [wall('wall-1', 0), wall('wall-2', 4), wall('wall-3', 8)],
      openings: [opening('op-1', 'wall-1'), opening('op-2', 'wall-2'), opening('op-3', 'wall-1')],
      objects: [object('obj-1', 1), object('obj-2', 2), object('obj-3', 3)],
      placements: [placement(DEVICES[0] ?? '', 'floor-1')],
      annotations: [pin('a-1', 'Leak'), measure('a-2')],
    }),
    floor('floor-2', 1, { placements: [placement(DEVICES[1] ?? '', 'floor-2')] }),
  ],
  ...parts,
});

const base = (): HomeMap => HOME_MAP.parse(document());

const settle = (map: HomeMap): object => ({ ...map, revision: 0, updatedAt: '' });

function expectRoundTrip(from: HomeMap, to: HomeMap, context = USER): void {
  const diff = diffHomeMaps(from, to);
  const forward = applyHomeMapEdits(from, diff.ops, context);
  expect(forward.conflicts).toEqual([]);
  expect(settle(forward.map)).toEqual(settle(to));
  const back = applyHomeMapEdits(forward.map, diff.inverse, context);
  expect(back.conflicts).toEqual([]);
  expect(settle(back.map)).toEqual(settle(from));
}

type Pick = (count: number) => number;

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null;

const rows = (value: unknown): Rec[] => (Array.isArray(value) ? value.filter(isRec) : []);

function shuffled<T>(list: readonly T[], pick: Pick): T[] {
  const out = [...list];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = pick(at + 1);
    const held = out[at];
    const swap = out[other];
    if (held === undefined || swap === undefined) continue;
    out[at] = swap;
    out[other] = held;
  }
  return out;
}

type Mutation = (doc: Rec, pick: Pick, tag: string) => Rec;

function onFirstFloor(doc: Rec, change: (floorDoc: Rec) => Rec): Rec {
  const [first, ...rest] = rows(doc['floors']);
  return { ...doc, floors: first === undefined ? rest : [change(first), ...rest] };
}

function rename(doc: Rec, _pick: Pick, tag: string): Rec {
  return { ...doc, name: `House ${tag}`, north: tag.length * 7 };
}

function retuneFloor(doc: Rec, pick: Pick, tag: string): Rec {
  const at = pick(2);
  const floors = rows(doc['floors']).map((f, index) =>
    index === at ? { ...f, name: `F ${tag}`, ceilingHeight: 2.4 + pick(3) / 10 } : f,
  );
  return { ...doc, floors };
}

function shuffleLists(doc: Rec, pick: Pick): Rec {
  return onFirstFloor(doc, (f) => ({
    ...f,
    objects: shuffled(rows(f['objects']), pick).slice(pick(2)),
    walls: shuffled(rows(f['walls']), pick),
  }));
}

function addThings(doc: Rec, pick: Pick, tag: string): Rec {
  return onFirstFloor(doc, (f) => ({
    ...f,
    objects: [...rows(f['objects']), object(`new-${tag}`, pick(9))],
    annotations: [...rows(f['annotations']), pin(`pin-${tag}`, tag)],
  }));
}

function relabel(doc: Rec, pick: Pick, tag: string): Rec {
  return onFirstFloor(doc, (f) => ({
    ...f,
    objects: rows(f['objects']).map((obj) => ({ ...obj, label: tag, rotation: pick(4) })),
    rooms: rows(f['rooms']).map((r) => ({ ...r, name: tag, wallPaint: 'blue' })),
    annotations: rows(f['annotations']).map((n) => (n['kind'] === 'pin' ? { ...n, text: tag } : n)),
  }));
}

function dropWall(doc: Rec, pick: Pick): Rec {
  return onFirstFloor(doc, (f) => {
    const gone = rows(f['walls'])[pick(3)];
    return {
      ...f,
      walls: rows(f['walls']).filter((w) => w !== gone),
      openings: rows(f['openings']).filter((o) => o['wallId'] !== gone?.['id']),
    };
  });
}

function addWall(doc: Rec, _pick: Pick, tag: string): Rec {
  return onFirstFloor(doc, (f) => ({
    ...f,
    walls: [...rows(f['walls']), wall(`w-${tag}`, 12)],
    openings: [...rows(f['openings']), opening(`o-${tag}`, `w-${tag}`)],
  }));
}

function loseOptionalKeys(doc: Rec): Rec {
  return onFirstFloor(doc, (f) => ({
    ...f,
    objects: rows(f['objects']).map(({ style: _style, ...rest }) => rest),
    openings: rows(f['openings']).map(({ opens: _opens, ...rest }) => rest),
  }));
}

function moveOpening(doc: Rec, _pick: Pick, tag: string): Rec {
  return onFirstFloor(doc, (f) => ({
    ...f,
    openings: rows(f['openings']).map((o, at) =>
      at === 0 ? { ...o, wallId: 'wall-3', offset: tag.length / 10 } : o,
    ),
  }));
}

function reorderAndAddFloor(doc: Rec, pick: Pick, tag: string): Rec {
  const floors = [...shuffled(rows(doc['floors']), pick), floor(`extra-${tag}`, 5 + tag.length)];
  return { ...doc, floors };
}

function movePlacements(doc: Rec): Rec {
  const [one, two, ...rest] = rows(doc['floors']);
  if (one === undefined || two === undefined) return doc;
  const moved = rows(one['placements']).map((p) => ({ ...p, floorId: two['id'] }));
  const kept = rows(two['placements']);
  return {
    ...doc,
    floors: [{ ...one, placements: [] }, { ...two, placements: [...kept, ...moved] }, ...rest],
  };
}

function keepOneFloor(doc: Rec): Rec {
  return { ...doc, floors: rows(doc['floors']).slice(0, 1) };
}

function changeSources(doc: Rec, _pick: Pick, tag: string): Rec {
  return {
    ...doc,
    sources: [source('robot', 3), source(`s-${tag}`, null)],
    notices: [notice(`n-${tag}`), notice('n-1')],
  };
}

function clearSources(doc: Rec): Rec {
  return { ...doc, sources: [], notices: [] };
}

const MUTATIONS: readonly Mutation[] = [
  rename,
  retuneFloor,
  shuffleLists,
  addThings,
  relabel,
  dropWall,
  addWall,
  loseOptionalKeys,
  moveOpening,
  reorderAndAddFloor,
  movePlacements,
  keepOneFloor,
  changeSources,
  clearSources,
];

function mutate(seed: number): HomeMap {
  const random = mulberry32(seed);
  const pick: Pick = (count) => Math.floor(random() * count);
  const steps = 2 + pick(4);
  let doc = document();
  for (let step = 0; step < steps; step += 1) {
    const mutation = MUTATIONS[pick(MUTATIONS.length)];
    if (mutation) doc = mutation(doc, pick, `${String(seed)}${String(step)}`);
  }
  return HOME_MAP.parse(doc);
}

describe('diffHomeMaps', () => {
  it('is empty for equal content and ignores revision and update time', () => {
    const map = base();
    const later = { ...map, revision: 9, updatedAt: '2027-01-01T00:00:00.000Z' };
    expect(diffHomeMaps(map, later)).toEqual({ ops: [], inverse: [] });
  });

  it('produces ops that are a valid edit batch and land as one revision', () => {
    const from = base();
    const to = HOME_MAP.parse(document({ name: 'Renamed', north: 90 }));
    const diff = diffHomeMaps(from, to);
    expect(HOME_MAP_EDIT_BATCH.safeParse({ baseRevision: 5, ops: diff.ops }).success).toBe(true);
    expect(diff.ops).toEqual([{ op: 'setMap', patch: { name: 'Renamed', north: 90 } }]);
    const result = applyHomeMapEdits(from, diff.ops, USER);
    expect(result.map.revision).toBe(from.revision + 1);
    expect(diff.inverse).toEqual([{ op: 'setMap', patch: { name: 'House', north: 0 } }]);
  });

  it('removes a wall together with its openings and restores them in place', () => {
    const from = base();
    const doc = document();
    const f = rows(doc['floors'])[0] ?? {};
    f['walls'] = rows(f['walls']).filter((w) => w['id'] !== 'wall-1');
    f['openings'] = rows(f['openings']).filter((o) => o['wallId'] !== 'wall-1');
    const to = HOME_MAP.parse(doc);
    const diff = diffHomeMaps(from, to);
    const kinds = diff.ops.map((op) => `${op.op}:${'id' in op ? op.id : ''}`);
    expect(kinds).toEqual(['remove:op-1', 'remove:op-3', 'remove:wall-1']);
    expectRoundTrip(from, to);
  });

  it('keeps the source override list untouched when a person restores a version', () => {
    const from = base();
    const doc = document();
    const f = rows(doc['floors'])[0] ?? {};
    const edited = rows(f['rooms'])[0];
    if (edited) {
      Object.assign(edited, {
        name: 'Lounge',
        origin: { kind: 'source', sourceId: 'robot', ref: 'room:room-1', overridden: ['name'] },
      });
    }
    const to = HOME_MAP.parse(doc);
    expectRoundTrip(from, to, USER);
    expectRoundTrip(to, from, USER);
    expectRoundTrip(from, to, ROBOT);
  });

  it('moves a placement between floors and reorders floors', () => {
    const from = base();
    const doc = document();
    const [one, two] = rows(doc['floors']);
    if (one && two) {
      one['placements'] = [];
      two['placements'] = [
        placement(DEVICES[1] ?? '', 'floor-2'),
        placement(DEVICES[0] ?? '', 'floor-2'),
      ];
      doc['floors'] = [two, one];
    }
    expectRoundTrip(from, HOME_MAP.parse(doc));
  });

  it('removes keys that disappear by replacing the element in place', () => {
    const from = base();
    const doc = document();
    const f = rows(doc['floors'])[0] ?? {};
    const sofa = rows(f['objects'])[1];
    if (sofa) delete sofa['style'];
    const to = HOME_MAP.parse(doc);
    const diff = diffHomeMaps(from, to);
    expect(diff.ops.map((op) => op.op)).toEqual(['remove', 'add']);
    expectRoundTrip(from, to);
  });

  it.each(Array.from({ length: 20 }, (_, seed) => seed + 1))(
    'generated case %i: diff then apply equals the target and the inverse restores the original',
    (seed) => {
      const from = base();
      const to = mutate(seed);
      expectRoundTrip(from, to, seed % 2 === 0 ? USER : ROBOT);
      expectRoundTrip(to, from, USER);
      expect(diffHomeMaps(to, to).ops).toEqual([]);
    },
  );

  it('uses op shapes the edit pipeline already knows', () => {
    const ops: readonly HomeMapOp[] = diffHomeMaps(base(), mutate(7)).ops;
    expect(HOME_MAP_EDIT_BATCH.safeParse({ baseRevision: 0, ops }).success).toBe(ops.length > 0);
  });
});
