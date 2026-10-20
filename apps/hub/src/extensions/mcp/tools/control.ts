import { SCENE_ACTIONS } from '@smarteverything/domain';
import { z } from 'zod';
import { OFFSET, moreOf, paged } from '../../../ai-tools/paging';
import { AUTOMATION_FILTER, listAutomations } from './automation-list';
import { CHANGE, applyChanges } from './changes';
import { reported, waitFor } from './commanding';
import { PHYSICAL, READS, defineTool, matches, type Tool, type ToolContext } from './registry';
import { deviceNames } from './targets';

export function scenes(context: Pick<ToolContext, 'store'>): Record<string, unknown>[] {
  const names = deviceNames(context.store);
  return context.store.scenes.list().map((scene) => {
    const actions = SCENE_ACTIONS.safeParse(scene.actions);
    return {
      id: scene.id,
      name: scene.name,
      icon: scene.icon,
      actions: actions.success
        ? actions.data.map((action) => ({
            ...action,
            device: names.get(action.deviceId) ?? action.deviceId,
          }))
        : scene.actions,
      problem: actions.success ? null : 'Its actions are not valid commands; edit the scene',
    };
  });
}

const SCENE_FILTER = z.strictObject({
  search: z.string().min(1).max(100).optional().describe('Words in the scene’s name'),
  limit: z.number().int().min(1).max(200).default(100),
  offset: OFFSET,
});

const CONTROL = z.strictObject({
  changes: z.array(CHANGE).min(1).max(50).describe('Changes, each on the devices it names'),
});

export const CONTROL_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'control_devices',
    input: CONTROL,
    annotations: PHYSICAL,
    run: (context, input) => applyChanges(context, input.changes),
  }),
  defineTool({
    name: 'run_scene',
    input: z.strictObject({ sceneId: z.uuid() }),
    annotations: PHYSICAL,
    run: async (context, input) => {
      const scene = context.store.scenes.byId(input.sceneId);
      const outcome = await waitFor(context, 'runScene', { params: { sceneId: input.sceneId } });
      return {
        structured: { scene: { id: scene.id, name: scene.name }, ...reported(context, outcome) },
      };
    },
  }),
  defineTool({
    name: 'list_scenes',
    input: SCENE_FILTER,
    annotations: READS,
    run: (context, input) => {
      const { search } = input;
      const listed = scenes(context).filter(
        (scene) => search === undefined || matches(search, String(scene['name'])),
      );
      const { rows, more } = paged(listed, input.offset, input.limit);
      return { structured: { scenes: rows, ...moreOf(more) } };
    },
  }),
  defineTool({
    name: 'list_automations',
    input: AUTOMATION_FILTER,
    annotations: READS,
    run: (context, input) => ({ structured: listAutomations(context, input) }),
  }),
];
