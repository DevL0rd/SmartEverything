import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { AppHref } from '../../../components/app-href';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ApiError,
  HOME_MAP_MAP_ID,
  type HomeMap,
  type HomeMapEditBatch,
  type HomeMapEditResultAnswer,
  type HomeMapId,
  type HomeMapOp,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { useSyncStatus } from '../../../store/selectors';
import { homeMapEditorApi, refetchHomeMap } from '../data/home-map-query';
import { refetchHomeMapSet, refreshMapTo } from '../data/map-set-query';
import { floorsByLevel, nextFloorLevel, nextFloorName } from '../editor/tool-state';

const log = new Logger('app.home-map');

export interface CreateMapPorts {
  readonly read: (mapId: HomeMapId | undefined) => Promise<HomeMap>;
  readonly edit: (mapId: HomeMapId, batch: HomeMapEditBatch) => Promise<HomeMapEditResultAnswer>;
  readonly landed: (mapId: HomeMapId, revision: number) => Promise<void>;
  readonly newId: () => string;
}

export type CreateMapOutcome =
  | { readonly kind: 'ready'; readonly mapId: HomeMapId; readonly floorId: string }
  | { readonly kind: 'offline' }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'unread' }
  | { readonly kind: 'unconfirmed' };

export function emptyFloorOp(map: HomeMap, floorId: string): HomeMapOp {
  return {
    op: 'addFloor',
    floor: {
      id: floorId,
      name: nextFloorName(map),
      level: nextFloorLevel(map),
      elevation: 0,
      rooms: [],
      walls: [],
      openings: [],
      objects: [],
      placements: [],
      annotations: [],
    },
  };
}

function readyOn(map: HomeMap): CreateMapOutcome | null {
  const [floor] = floorsByLevel(map);
  return floor === undefined ? null : { kind: 'ready', mapId: map.id, floorId: floor.id };
}

async function reread(ports: CreateMapPorts, mapId: HomeMapId): Promise<HomeMap | null> {
  try {
    return await ports.read(mapId);
  } catch (error) {
    log.error('home_map.create_reread_failed', error);
    return null;
  }
}

async function afterLostAnswer(ports: CreateMapPorts, mapId: HomeMapId): Promise<CreateMapOutcome> {
  const map = await reread(ports, mapId);
  return (map === null ? null : readyOn(map)) ?? { kind: 'unconfirmed' };
}

async function settle(
  ports: CreateMapPorts,
  map: HomeMap,
  floorId: string,
  answer: HomeMapEditResultAnswer,
): Promise<CreateMapOutcome> {
  try {
    await ports.landed(map.id, answer.revision);
  } catch (error) {
    log.error('home_map.create_refresh_failed', error);
  }
  if (answer.conflicts.length === 0) return { kind: 'ready', mapId: map.id, floorId };
  log.warn('home_map.create_conflict', { conflicts: answer.conflicts.length });
  const now = await reread(ports, map.id);
  return (
    (now === null ? null : readyOn(now)) ?? {
      kind: 'refused',
      message: 'The map changed while it was being made · Try again',
    }
  );
}

async function addFloor(ports: CreateMapPorts, map: HomeMap): Promise<CreateMapOutcome> {
  const floorId = ports.newId();
  let answer: HomeMapEditResultAnswer;
  try {
    answer = await ports.edit(map.id, {
      baseRevision: map.revision,
      ops: [emptyFloorOp(map, floorId)],
    });
  } catch (error) {
    if (error instanceof ApiError) {
      log.warn('home_map.create_refused', { code: error.code });
      return { kind: 'refused', message: error.message };
    }
    log.error('home_map.create_answer_lost', error);
    return afterLostAnswer(ports, map.id);
  }
  return settle(ports, map, floorId, answer);
}

export async function createMapContent(
  ports: CreateMapPorts,
  mapId: HomeMapId | undefined,
  connected: boolean,
): Promise<CreateMapOutcome> {
  if (!connected) return { kind: 'offline' };
  let map: HomeMap;
  try {
    map = await ports.read(mapId);
  } catch (error) {
    log.error('home_map.create_read_failed', error);
    return { kind: 'unread' };
  }
  return readyOn(map) ?? addFloor(ports, map);
}

export const EDITOR_PATH = '/home-map/edit';

export function createdEditorHref(mapId: HomeMapId, floorId: string): AppHref {
  return { pathname: EDITOR_PATH, params: { mapId, floorId, tool: 'rooms' } };
}

const EDITOR_LAUNCH = z.object({
  mapId: HOME_MAP_MAP_ID.optional(),
  floorId: z.string().min(1).optional(),
});

export type EditorLaunch = z.infer<typeof EDITOR_LAUNCH>;

export function editorLaunchOf(params: unknown): EditorLaunch {
  const parsed = EDITOR_LAUNCH.safeParse(params);
  if (parsed.success) return parsed.data;
  log.warn('home_map.editor_params_unreadable', { issues: parsed.error.issues.length });
  return {};
}

export function createMapPorts(client: QueryClient): CreateMapPorts {
  return {
    read: (mapId) => refetchHomeMap(client, mapId),
    edit: (mapId, batch) => homeMapEditorApi(mapId).edit(batch),
    landed: async (mapId, revision): Promise<void> => {
      await refreshMapTo(client, mapId, revision);
      await refetchHomeMapSet(client);
    },
    newId: (): string => randomUUID(),
  };
}

const PROBLEMS: Readonly<Record<'offline' | 'unread' | 'unconfirmed', string>> = {
  offline: 'Connect to the hub to create a map',
  unread: "Couldn't reach the map · Try again",
  unconfirmed: "Couldn't confirm the new map · Try again",
};

export function createProblemOf(outcome: CreateMapOutcome): string | null {
  if (outcome.kind === 'ready') return null;
  return outcome.kind === 'refused' ? outcome.message : PROBLEMS[outcome.kind];
}

export interface CreateMap {
  readonly create: () => void;
  readonly busy: boolean;
  readonly offline: boolean;
  readonly problem: string | null;
}

export function useCreateMap(mapId: HomeMapId | undefined): CreateMap {
  const client = useQueryClient();
  const router = useRouter();
  const connected = useSyncStatus().status === 'live';
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    const outcome = await createMapContent(createMapPorts(client), mapId, connected);
    setBusy(false);
    setProblem(createProblemOf(outcome));
    if (outcome.kind === 'ready') router.push(createdEditorHref(outcome.mapId, outcome.floorId));
  };
  return {
    create: (): void => {
      if (!busy) background(run(), 'home_map.create_failed');
    },
    busy,
    offline: !connected,
    problem: connected ? problem : PROBLEMS.offline,
  };
}
