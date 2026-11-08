import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo } from 'react';
import { z } from 'zod';
import type { HomeMapSummary } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { ValueStore, useValue, usePausable } from '../../../design/external-store';
import { jsonText } from '../../../format/json-text';

const log = new Logger('app.home-map');

export const HOME_MAP_PAGES = ['home', 'devices', 'vacuum', 'shelly'] as const;

export type HomeMapPage = (typeof HOME_MAP_PAGES)[number];

const CHOICES = z.partialRecord(z.enum(HOME_MAP_PAGES), z.string().min(1));

export type MapChoices = z.infer<typeof CHOICES>;

const STORAGE_KEY = 'smarteverything.home-map-choices';

export function resolveMapChoice(
  maps: readonly HomeMapSummary[],
  remembered: string | undefined,
): HomeMapSummary | null {
  const named = maps.find((map) => map.id === remembered);
  if (named !== undefined) return named;
  const standing = maps.find((map) => map.isDefault);
  if (standing !== undefined) return standing;
  return maps.reduce<HomeMapSummary | null>(
    (first, map) => (first === null || map.position < first.position ? map : first),
    null,
  );
}

export function withMapChoice(choices: MapChoices, page: HomeMapPage, mapId: string): MapChoices {
  return { ...choices, [page]: mapId };
}

const choices = new ValueStore<MapChoices>({});
const loaded = new ValueStore<boolean>(false);

async function readStored(): Promise<void> {
  const text = await AsyncStorage.getItem(STORAGE_KEY);
  if (text === null) return;
  const read = jsonText(text);
  const parsed = read.ok ? CHOICES.safeParse(read.value) : null;
  if (parsed?.success === true) choices.set({ ...parsed.data, ...choices.get() });
  else log.warn('home_map.choices_unreadable', { length: text.length });
}

async function loadOnce(): Promise<void> {
  try {
    await readStored();
  } catch (error) {
    log.error('home_map.choices_not_read', error);
  }
  loaded.set(true);
}

let loading: Promise<void> | null = null;

export function loadMapChoices(): Promise<void> {
  loading ??= loadOnce();
  return loading;
}

async function persist(page: HomeMapPage): Promise<void> {
  await loadMapChoices();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(choices.get()));
  } catch (error) {
    log.warn('home_map.choice_not_saved', { page, reason: String(error) });
  }
}

export function rememberMapChoice(page: HomeMapPage, mapId: string): void {
  choices.set(withMapChoice(choices.get(), page, mapId));
  background(persist(page), 'home_map.choice_persist_failed');
}

export function rememberedMapChoice(page: HomeMapPage): string | undefined {
  return choices.get()[page];
}

export interface MapChoice {
  readonly map: HomeMapSummary | null;
  readonly ready: boolean;
  readonly choose: (mapId: string) => void;
}

export function useMapChoice(page: HomeMapPage, maps: readonly HomeMapSummary[] | null): MapChoice {
  useEffect(() => {
    background(loadMapChoices(), 'home_map.choices_load_failed');
  }, []);
  const remembered = usePausable(choices.subscribe, () => choices.get()[page]);
  const isLoaded = useValue(loaded);
  const map = useMemo(
    () => (maps === null ? null : resolveMapChoice(maps, remembered)),
    [maps, remembered],
  );
  const choose = useCallback(
    (mapId: string): void => {
      rememberMapChoice(page, mapId);
    },
    [page],
  );
  return { map, ready: isLoaded && maps !== null, choose };
}
