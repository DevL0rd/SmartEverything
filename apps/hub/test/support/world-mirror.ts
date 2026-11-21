import { WorldMirror } from '../../src/automations/world-v3/world-mirror';
import type { SeededStore } from './store';

export async function loadedWorld(store: SeededStore): Promise<WorldMirror> {
  const world = new WorldMirror(store.feed, store.host, store.live.home);
  await world.load();
  return world;
}
