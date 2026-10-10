import { API_ENDPOINTS as E, type CommandAction } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.scenes');

export interface SceneSave {
  readonly sceneId: string | null;
  readonly name: string;
  readonly icon: string;
  readonly actions: readonly CommandAction[];
  readonly position: number;
}

export async function saveScene(save: SceneSave): Promise<string> {
  const fields = { name: save.name, icon: save.icon, actions: [...save.actions] };
  const saved =
    save.sceneId === null
      ? await api().call(E.createScene, { body: { ...fields, position: save.position } })
      : await api().call(E.updateScene, { params: { sceneId: save.sceneId }, body: fields });
  log.info('scene.saved', { sceneId: saved.id, created: save.sceneId === null });
  return saved.id;
}

export async function deleteScene(sceneId: string): Promise<void> {
  await api().call(E.removeScene, { params: { sceneId } });
  log.info('scene.deleted', { sceneId });
}

export async function orderScenes(ids: readonly string[]): Promise<void> {
  await api().call(E.orderScenes, { body: { ids: [...ids] } });
  log.info('scene.reordered', { scenes: ids.length });
}

export async function runScene(sceneId: string): Promise<number> {
  const rows = await api().call(E.runScene, { params: { sceneId } });
  log.info('scene.run', { sceneId, commands: rows.length });
  return rows.length;
}
