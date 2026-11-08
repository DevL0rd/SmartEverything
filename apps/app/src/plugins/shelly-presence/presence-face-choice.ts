import { useSyncExternalStore } from 'react';
import { QueryObserver, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { HomeMap } from '@smarteverything/domain';
import { homeMapRenderScene } from '../../components/house-map/adapters/home-map-scene';
import { homeMapQueryOptions } from '../../features/home-map/data/home-map-query';
import { mapHasContent } from '../../features/home/model/hero';
import { faceShown, nextFace, presenceFaces, type PresenceFace } from './presence-face-model';

export interface FaceChoice {
  readonly face: PresenceFace;
  readonly to: PresenceFace | null;
}

export interface PresenceFaceChoice extends FaceChoice {
  readonly pick: (face: PresenceFace) => void;
}

const NO_PLACED: ReadonlySet<string> = new Set();

const ROOM_ONLY: FaceChoice = { face: 'room', to: null };

const MAP_SHOWN: FaceChoice = { face: 'map', to: 'room' };

const ROOM_SHOWN: FaceChoice = { face: 'room', to: 'map' };

export function placedSensorIds(map: HomeMap | undefined): ReadonlySet<string> {
  if (map === undefined || !mapHasContent(map)) return NO_PLACED;
  const ids = homeMapRenderScene({ map, live: {} }).floors.flatMap((floor) =>
    floor.placements.map((placement) => placement.deviceId),
  );
  return new Set(ids);
}

export function choiceOf(placed: boolean, picked: PresenceFace | null): FaceChoice {
  const faces = presenceFaces(placed);
  const face = faceShown(faces, picked);
  if (nextFace(faces, face) === null) return ROOM_ONLY;
  return face === 'map' ? MAP_SHOWN : ROOM_SHOWN;
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

export class PresenceFaceChoices {
  private readonly listeners = new Set<() => void>();

  private readonly picked = new Map<string, PresenceFace>();

  private readonly observer: QueryObserver<HomeMap>;

  private placed: ReadonlySet<string> = NO_PLACED;

  private release: (() => void) | null = null;

  constructor(client: QueryClient) {
    this.observer = new QueryObserver(client, homeMapQueryOptions());
  }

  private place(map: HomeMap | undefined): void {
    const next = placedSensorIds(map);
    if (sameIds(next, this.placed)) return;
    this.placed = next;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.release === null) {
      this.place(this.observer.getCurrentResult().data);
      this.release = this.observer.subscribe((result) => {
        this.place(result.data);
      });
    }
    return (): void => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.release?.();
      this.release = null;
    };
  };

  readonly choiceOf = (deviceId: string): FaceChoice =>
    choiceOf(this.placed.has(deviceId), this.picked.get(deviceId) ?? null);

  readonly pick = (deviceId: string, face: PresenceFace): void => {
    this.picked.set(deviceId, face);
    this.notify();
  };
}

const CHOICES_BY_CLIENT = new WeakMap<QueryClient, PresenceFaceChoices>();

function choicesOf(client: QueryClient): PresenceFaceChoices {
  const known = CHOICES_BY_CLIENT.get(client);
  if (known !== undefined) return known;
  const created = new PresenceFaceChoices(client);
  CHOICES_BY_CLIENT.set(client, created);
  return created;
}

export function usePresenceFaceChoice(deviceId: string): PresenceFaceChoice {
  const choices = choicesOf(useQueryClient());
  const choice = useSyncExternalStore(choices.subscribe, () => choices.choiceOf(deviceId));
  return {
    ...choice,
    pick: (face): void => {
      choices.pick(deviceId, face);
    },
  };
}
